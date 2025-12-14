// ==UserScript==
// @name         H5媒体播控器
// @namespace    http://tampermonkey.net/
// @version      2.3.1.8
// @description  针对手机浏览器的H5视频调速器，修复音频模式切换问题，增强强制播放网站兼容性，集成专业级抓取功能
// @author       优化重构
// @match        *://*/*
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addElement
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // 模块1: 主控制器 - 核心协调模块 (修改)
    // =========================================================================
    class VideoSpeedController {
        constructor() {
            this.config = this._getEnhancedConfig();
            this.state = this._getInitialState();
            this.managers = this._initializeEnhancedManagers();
            this.ui = null;

            this._initialize();
        }

        _getEnhancedConfig() {
            const baseConfig = {
                playbackRate: {
                    min: 0.1,
                    max: 16,
                    default: 1.0,
                    steps: [0.5, 1.0, 2.0, 8.0]
                },
                storage: {
                    playbackRecordExpiry: 120 * 60 * 1000,
                    audioModeDuration: 30 * 60 * 1000
                },
                ui: {
                    position: { bottom: '28vw', left: '5vw' },
                    sizes: {
                        main: '10vw',
                        secondary: '8vw',
                        progress: '10.5vw'
                    },
                    colors: {
                        primary: 'rgba(255, 255, 255, 0.9)',
                        secondary: 'rgba(255, 255, 255, 0.5)',
                        background: 'rgba(0, 0, 0, 0.6)'
                    }
                },
                detection: {
                    swipeThreshold: 50,
                    swipeTimeThreshold: 300,
                    scrollThreshold: 100,
                    checkInterval: 2000,
                    progressUpdateInterval: 500
                },
                forcedPlaybackSites: [
                    'x.com', 'twitter.com', 'tiktok.com',
                    'douyin.com', 'instagram.com'
                ],
                restoration: {
                    minPlayTimeToSave: 1,
                    minPlayTimeToRestore: 1,
                    maxCurrentTimeToRestore: 10,
                    retryCount: 5,
                    retryInterval: 500,
                    restoreWindow: 15
                },
                performance: {
                    videoSwitchDelay: 50,
                    batchOperationDelay: 0,
                    styleApplyDelay: 0
                },
                download: {
                    maxRetryCount: 3,
                    timeout: 30000,
                    concurrentDownloads: 2,
                    enableSmartDetection: true,
                    minFileSize: 1024,
                    maxFileSize: 500 * 1024 * 1024
                },
                // 新增：性能优化配置
                optimization: {
                    enableAdaptiveQuality: true,
                    enableSmartPreload: true,
                    enableHardwareAcceleration: true,
                    bufferSize: 30,
                    qualityThreshold: 0.8,
                    bandwidthThreshold: 2,
                    maxCacheSize: 100
                },
                // 在VideoSpeedController._getEnhancedConfig()中添加
                screenshot: {
                    timePoints: [0, -0.2, -0.4, -0.6],
                    delayBetweenShots: 50,
                    maxRetryCount: 3,
                    previewGridGap: 6,
                    crossOriginDomains: {}
                }


            };

            baseConfig.enhanced = {
                twitterSites: ['x.com', 'twitter.com'],
                noSaveRecordSites: ['tiktok.com', 'x.com', 'twitter.com', 'douyin.com', 'instagram.com'],
                audioModeTemporary: true,
                initializationRetries: 3,
                retryInterval: 2000,
                bilibiliSites: ['bilibili.com', 'b23.tv', 'biligame.com']
            };

            return baseConfig;
        }

        _getInitialState() {
            return {
                playbackRate: parseFloat(GM_getValue('videoPlaybackRate', 1.0)),
                isPlaying: false,
                isLooping: false,
                isMuted: false,
                isAudioMode: false,
                currentVideo: null,
                previousVideo: null,
                isControlsCreated: false,
                // 新增：性能状态
                performanceStats: {
                    networkQuality: 0,
                    devicePerformance: 0,
                    optimizationLevel: 0
                }
            };
        }

        _initializeEnhancedManagers() {
            return {
                resourceAnalyzer: new EnhancedResourceAnalyzer(this),
                download: new EnhancedDownloadManager(this),
                video: new EnhancedVideoManager(this),
                audio: new FixedAudioModeManager(this),
                audioState: new EnhancedAudioStateManager(this),
                loop: new FixedLoopStateManager(this),
                storage: new EnhancedStorageManager(this),
                restoration: new EnhancedRestorationManager(this),
                swipe: new EnhancedSwipeDetectionManager(this),
                scroll: new EnhancedScrollDetectionManager(this),
                batch: new BatchVideoOperationManager(this),
                streamingMedia: new StreamingMediaEnhancer(this), // 新增
                screenshot: new ScreenshotManager(this),
                // 新增：性能分析和管理模块
                performanceAnalyzer: new PerformanceAnalyzer(this),
                performanceMonitor: new PerformanceMonitor(this)
            };
        }

        async _initialize() {
            try {
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => this._startWithRetry());
                } else {
                    this._startWithRetry();
                }

                window.addEventListener('beforeunload', () => this._cleanup());
                this._setupSPAListener();

            } catch (error) {
                console.error('VideoSpeedController初始化失败:', error);
            }
        }

        _startWithRetry() {
            let retryCount = 0;

            const tryStart = () => {
                try {
                    this._start();
                } catch (error) {
                    retryCount++;
                    if (retryCount < this.config.enhanced.initializationRetries) {
                        console.log(`初始化失败，第${retryCount}次重试...`);
                        setTimeout(tryStart, this.config.enhanced.retryInterval);
                    } else {
                        console.error('初始化最终失败:', error);
                    }
                }
            };

            tryStart();
        }

        _start() {
            this.ui = new EnhancedUIManager(this);

            // 初始化核心模块
            this.managers.resourceAnalyzer.initialize();
            this.managers.download.initialize();
            this.managers.video.initialize();
            this.managers.audio.initialize();
            this.managers.audioState.initialize();
            this.managers.restoration.initialize();
            this.managers.swipe.initialize();
            this.managers.scroll.initialize();
            this.managers.streamingMedia.initialize(); // 新增

            // 新增：性能模块异步初始化，不阻塞主流程
            setTimeout(() => {
                try {
                    this.managers.performanceAnalyzer.initialize();
                    this.managers.performanceMonitor.initialize();
                    console.log('性能模块异步初始化完成');
                } catch (error) {
                    console.error('性能模块初始化失败:', error);
                }
            }, 1000);

            // 新增：截图模块初始化
            setTimeout(() => {
                try {
                    this.managers.screenshot.initialize();
                    console.log('截图模块异步初始化完成');
                } catch (error) {
                    console.error('截图模块初始化失败:', error);
                }
            }, 500);

            this._setupEventListeners();
            this._main();
        }

        _setupEventListeners() {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.managers.video.saveCurrentState();
                } else {
                    setTimeout(() => this._main(), 100);
                }
            });

            window.addEventListener('resize',
                this._debounce(() => this._main(), 400)
            );

            // 新增：性能监控事件
            this._setupPerformanceEventListeners();
        }

        // 新增：性能监控事件监听
        _setupPerformanceEventListeners() {
            // 网络状态变化时重新优化
            if ('connection' in navigator) {
                navigator.connection.addEventListener('change', () => {
                    console.log('网络状态变化，重新优化视频...');
                    this.managers.video.adaptToNetworkChange();
                });
            }

            // 内存压力处理
            window.addEventListener('memorypressure', () => {
                this.managers.video.handleMemoryPressure();
            });
        }

        _setupSPAListener() {
            let currentUrl = window.location.href;
            setInterval(() => {
                if (window.location.href !== currentUrl) {
                    currentUrl = window.location.href;
                    this._handlePageChange();
                }
            }, 1000);
        }

        _handlePageChange() {
            this.state.isAudioMode = false;
            this.state.currentVideo = null;
            this.state.previousVideo = null;

            setTimeout(() => this._main(), 1000);
        }

        _main() {
            if (this.state.isControlsCreated) {
                this.managers.video.updateControlsState();
                return;
            }

            this.ui.createStyles();
            this.ui.createControls();
            this._setupRobustListeners();

            this.state.isControlsCreated = true;
            this.managers.video.updateControlsState();
            this.ui.startProgressUpdate();
        }

        _setupRobustListeners() {
            this.managers.video.setupPersistentObserver();
            this.managers.video.setupStableInterval();
            this.managers.video.setupComprehensiveEventListeners();
            this.managers.video.setupVideoInteractionTracking();
        }

        _debounce(func, wait) {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
            };
        }

        _cleanup() {
            this.managers.video.cleanup();
            this.managers.audio.cleanup();
            this.managers.storage.cleanupExpiredRecords();

            // 新增：清理性能模块
            this.managers.performanceAnalyzer.destroy();
            this.managers.performanceMonitor.destroy();
            // 新增：清理流媒体模块
            this.managers.streamingMedia.destroy();
        }

        _isTwitterSite() {
            const hostname = window.location.hostname.toLowerCase();
            return this.config.enhanced.twitterSites.some(site =>
                hostname.includes(site.toLowerCase())
            );
        }

        _isForcedPlaybackSite() {
            const hostname = window.location.hostname.toLowerCase();
            return this.config.forcedPlaybackSites.some(site =>
                hostname.includes(site.toLowerCase())
            );
        }

        _isBilibiliSite() {
            const hostname = window.location.hostname.toLowerCase();
            return this.config.enhanced.bilibiliSites.some(site =>
                hostname.includes(site.toLowerCase())
            );
        }

        _shouldSaveRecord() {
            const hostname = window.location.hostname.toLowerCase();
            return !this.config.enhanced.noSaveRecordSites.some(site =>
                hostname.includes(site.toLowerCase())
            );
        }

        // 新增：获取性能报告
        getPerformanceReport() {
            if (this.managers.performanceAnalyzer && this.managers.performanceMonitor) {
                return {
                    analyzer: this.managers.performanceAnalyzer.getPerformanceReport(),
                    monitor: this.managers.performanceMonitor.getPerformanceReport(),
                    videoStats: this.managers.video.getAllVideoPerformance(),
                    downloadStats: this.managers.download.getDownloadStats()
                };
            }
            return null;
        }

        // 新增：更新性能状态
        updatePerformanceStats() {
            if (this.managers.performanceAnalyzer) {
                const networkScore = this.managers.performanceAnalyzer.getNetworkQualityScore();
                const deviceScore = this.managers.performanceAnalyzer.getDevicePerformanceScore();

                this.state.performanceStats = {
                    networkQuality: networkScore,
                    devicePerformance: deviceScore,
                    optimizationLevel: Math.round((networkScore + deviceScore) / 2)
                };
            }
        }

        getState() {
            return { ...this.state };
        }

        setState(newState) {
            this.state = { ...this.state, ...newState };

            if (newState.playbackRate !== undefined) {
                GM_setValue('videoPlaybackRate', newState.playbackRate);
                this.managers.video.syncAllVideosSpeed();
            }

            if (newState.isAudioMode !== undefined) {
                GM_setValue('videoAudioMode', newState.isAudioMode);
            }

            // 新增：性能状态更新
            if (newState.performanceStats !== undefined) {
                this.updatePerformanceStats();
            }
        }
    }

    // =========================================================================
    // 新增模块: 性能分析器模块 (新增模块)
    // =========================================================================
    class PerformanceAnalyzer {
        constructor(controller) {
            this.controller = controller;

            // 性能数据
            this.networkInfo = {
                bandwidth: 0,
                latency: 0,
                effectiveType: 'unknown',
                saveData: false,
                downlink: 0
            };

            this.deviceInfo = {
                hardwareConcurrency: navigator.hardwareConcurrency || 4,
                memory: navigator.deviceMemory || 4,
                platform: navigator.platform,
                userAgent: navigator.userAgent,
                webglSupport: false,
                hardwareAcceleration: false,
                videoDecodingSupport: {}
            };

            this.performanceMetrics = {
                fps: 0,
                cpuUsage: 0,
                memoryUsage: 0,
                networkUtilization: 0
            };

            // 历史数据
            this.historyData = {
                bandwidth: [],
                latency: [],
                fps: [],
                cpuUsage: []
            };

            // 测试相关
            this.lastBandwidthTest = 0;
            this.bandwidthTestInterval = 30000;
        }

        /**
         * 初始化性能分析器
         */
        async initialize() {
            console.log('初始化性能分析器...');

            // 检测设备信息
            await this.detectDeviceCapabilities();

            // 检测网络信息
            await this.detectNetworkInfo();

            // 启动性能监控
            this.startPerformanceMonitoring();

            // 启动带宽测试
            this.startBandwidthTesting();

            console.log('性能分析器初始化完成');
        }

        /**
         * 检测设备性能能力
         */
        async detectDeviceCapabilities() {
            try {
                // 检测WebGL支持
                this.deviceInfo.webglSupport = this.detectWebGLSupport();

                // 检测硬件加速支持
                this.deviceInfo.hardwareAcceleration = await this.detectHardwareAcceleration();

                // 检测视频解码能力
                this.deviceInfo.videoDecodingSupport = await this.detectVideoDecodingSupport();

                console.log(`设备性能检测完成:`, this.deviceInfo);

            } catch (error) {
                console.error(`设备性能检测失败: ${error.message}`);
            }
        }

        /**
         * 检测WebGL支持
         */
        detectWebGLSupport() {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                return !!gl;
            } catch (error) {
                return false;
            }
        }

        /**
         * 检测硬件加速支持
         */
        async detectHardwareAcceleration() {
            try {
                const video = document.createElement('video');
                video.style.display = 'none';
                document.body.appendChild(video);

                const canPlayH264 = video.canPlayType('video/mp4; codecs="avc1.42E01E"') === 'probably';
                const canPlayVP9 = video.canPlayType('video/webm; codecs="vp09.00.10.08"') === 'probably';

                document.body.removeChild(video);
                return canPlayH264 || canPlayVP9;
            } catch (error) {
                return false;
            }
        }

        /**
         * 检测视频解码支持
         */
        async detectVideoDecodingSupport() {
            const codecs = ['h264', 'h265', 'vp8', 'vp9', 'av1'];
            const support = {};

            for (const codec of codecs) {
                support[codec] = await this.testCodecSupport(codec);
            }

            return support;
        }

        /**
         * 测试特定编码格式支持
         */
        async testCodecSupport(codec) {
            try {
                const video = document.createElement('video');
                let mimeType = '';

                switch (codec) {
                    case 'h264':
                        mimeType = 'video/mp4; codecs="avc1.42E01E"';
                        break;
                    case 'h265':
                        mimeType = 'video/mp4; codecs="hev1.1.6.L93.B0"';
                        break;
                    case 'vp8':
                        mimeType = 'video/webm; codecs="vp8"';
                        break;
                    case 'vp9':
                        mimeType = 'video/webm; codecs="vp09.00.10.08"';
                        break;
                    case 'av1':
                        mimeType = 'video/mp4; codecs="av01.0.08M.10"';
                        break;
                }

                const support = video.canPlayType(mimeType);
                return support === 'probably' || support === 'maybe';

            } catch (error) {
                return false;
            }
        }

        /**
         * 检测网络信息
         */
        async detectNetworkInfo() {
            try {
                // 使用Navigator API获取网络信息
                if ('connection' in navigator) {
                    const connection = navigator.connection;

                    this.networkInfo.effectiveType = connection.effectiveType || 'unknown';
                    this.networkInfo.downlink = connection.downlink || 0;
                    this.networkInfo.saveData = connection.saveData || false;

                    // 监听网络变化
                    connection.addEventListener('change', () => {
                        this.updateNetworkInfo();
                    });
                }

                // 执行带宽测试
                await this.performBandwidthTest();

                // 执行延迟测试
                await this.performLatencyTest();

                console.log(`网络信息检测完成:`, this.networkInfo);

            } catch (error) {
                console.error(`网络信息检测失败: ${error.message}`);
            }
        }

        /**
         * 更新网络信息
         */
        updateNetworkInfo() {
            if ('connection' in navigator) {
                const connection = navigator.connection;

                this.networkInfo.effectiveType = connection.effectiveType || 'unknown';
                this.networkInfo.downlink = connection.downlink || 0;
                this.networkInfo.saveData = connection.saveData || false;

                console.log(`网络状态更新: ${this.networkInfo.effectiveType}`);
            }
        }

        /**
         * 执行带宽测试
         */
        async performBandwidthTest() {
            try {
                const testSizes = [1024, 2048]; // KB
                let totalBandwidth = 0;
                let validTests = 0;

                for (const size of testSizes) {
                    const bandwidth = await this.measureBandwidth(size);
                    if (bandwidth > 0) {
                        totalBandwidth += bandwidth;
                        validTests++;
                    }
                }

                if (validTests > 0) {
                    this.networkInfo.bandwidth = totalBandwidth / validTests;
                    this.addToHistory('bandwidth', this.networkInfo.bandwidth);
                }

            } catch (error) {
                console.error(`带宽测试失败: ${error.message}`);
            }
        }

        /**
         * 测量带宽
         */
        async measureBandwidth(sizeKB) {
            return new Promise((resolve) => {
                try {
                    const testUrl = `https://httpbin.org/bytes/${sizeKB * 1024}`;
                    const startTime = performance.now();

                    fetch(testUrl, {
                        method: 'GET',
                        cache: 'no-cache'
                    }).then(response => {
                        if (!response.ok) {
                            resolve(0);
                            return;
                        }
                        return response.blob();
                    }).then(() => {
                        const endTime = performance.now();
                        const duration = (endTime - startTime) / 1000;
                        const bandwidth = (sizeKB * 8) / duration;
                        resolve(bandwidth);
                    }).catch(() => {
                        resolve(0);
                    });

                    setTimeout(() => {
                        resolve(0);
                    }, 10000);

                } catch (error) {
                    resolve(0);
                }
            });
        }

        /**
         * 执行延迟测试
         */
        async performLatencyTest() {
            try {
                const testUrls = [
                    'https://httpbin.org/delay/0',
                    'https://httpbin.org/delay/0'
                ];

                let totalLatency = 0;
                let validTests = 0;

                for (const url of testUrls) {
                    const latency = await this.measureLatency(url);
                    if (latency > 0) {
                        totalLatency += latency;
                        validTests++;
                    }
                }

                if (validTests > 0) {
                    this.networkInfo.latency = totalLatency / validTests;
                    this.addToHistory('latency', this.networkInfo.latency);
                }

            } catch (error) {
                console.error(`延迟测试失败: ${error.message}`);
            }
        }

        /**
         * 测量延迟
         */
        async measureLatency(url) {
            return new Promise((resolve) => {
                try {
                    const startTime = performance.now();

                    fetch(url, {
                        method: 'HEAD',
                        mode: 'no-cors',
                        cache: 'no-cache'
                    }).then(() => {
                        const endTime = performance.now();
                        const latency = endTime - startTime;
                        resolve(latency);
                    }).catch(() => {
                        resolve(0);
                    });

                    setTimeout(() => {
                        resolve(0);
                    }, 5000);

                } catch (error) {
                    resolve(0);
                }
            });
        }

        /**
         * 启动性能监控
         */
        startPerformanceMonitoring() {
            // 监控FPS
            this.startFPSMonitoring();

            // 监控内存使用
            this.startMemoryMonitoring();

            // 监控CPU使用
            this.startCPUMonitoring();
        }

        /**
         * 启动FPS监控
         */
        startFPSMonitoring() {
            let lastTime = performance.now();
            let frameCount = 0;

            const measureFPS = () => {
                frameCount++;
                const currentTime = performance.now();

                if (currentTime - lastTime >= 1000) {
                    this.performanceMetrics.fps = frameCount;
                    this.addToHistory('fps', this.performanceMetrics.fps);

                    frameCount = 0;
                    lastTime = currentTime;
                }

                requestAnimationFrame(measureFPS);
            };

            requestAnimationFrame(measureFPS);
        }

        /**
         * 启动内存监控
         */
        startMemoryMonitoring() {
            setInterval(() => {
                if ('memory' in performance) {
                    const memory = performance.memory;
                    this.performanceMetrics.memoryUsage = {
                        used: memory.usedJSHeapSize,
                        total: memory.totalJSHeapSize,
                        limit: memory.jsHeapSizeLimit,
                        usage: memory.usedJSHeapSize / memory.jsHeapSizeLimit
                    };
                }
            }, 5000);
        }

        /**
         * 启动CPU监控
         */
        startCPUMonitoring() {
            let lastTime = performance.now();

            setInterval(() => {
                const currentTime = performance.now();
                const timeDiff = currentTime - lastTime;

                const busyStart = performance.now();
                let busyTime = 0;

                while (performance.now() - busyStart < 10) {
                    Math.random();
                }

                busyTime = performance.now() - busyStart;
                const cpuUsage = Math.min((busyTime / 10) * 100, 100);

                this.performanceMetrics.cpuUsage = cpuUsage;
                this.addToHistory('cpuUsage', cpuUsage);

                lastTime = currentTime;
            }, 5000);
        }

        /**
         * 启动带宽测试
         */
        startBandwidthTesting() {
            setInterval(async () => {
                const now = Date.now();
                if (now - this.lastBandwidthTest > this.bandwidthTestInterval) {
                    await this.performBandwidthTest();
                    this.lastBandwidthTest = now;
                }
            }, this.bandwidthTestInterval);
        }

        /**
         * 添加数据到历史记录
         */
        addToHistory(metric, value) {
            if (!this.historyData[metric]) {
                this.historyData[metric] = [];
            }

            this.historyData[metric].push({
                value: value,
                timestamp: Date.now()
            });

            if (this.historyData[metric].length > 100) {
                this.historyData[metric] = this.historyData[metric].slice(-100);
            }
        }

        /**
         * 获取网络质量评分
         */
        getNetworkQualityScore() {
            let score = 0;

            if (this.networkInfo.bandwidth > 5000) score += 40;
            else if (this.networkInfo.bandwidth > 2000) score += 30;
            else if (this.networkInfo.bandwidth > 1000) score += 20;
            else score += 10;

            if (this.networkInfo.latency < 100) score += 30;
            else if (this.networkInfo.latency < 300) score += 20;
            else if (this.networkInfo.latency < 500) score += 10;
            else score += 5;

            switch (this.networkInfo.effectiveType) {
                case '4g': score += 20; break;
                case '3g': score += 15; break;
                case '2g': score += 5; break;
                case 'slow-2g': score += 2; break;
                default: score += 10;
            }

            if (!this.networkInfo.saveData) score += 10;

            return Math.min(score, 100);
        }

        /**
         * 获取设备性能评分
         */
        getDevicePerformanceScore() {
            let score = 0;

            if (this.deviceInfo.hardwareConcurrency >= 8) score += 25;
            else if (this.deviceInfo.hardwareConcurrency >= 4) score += 20;
            else if (this.deviceInfo.hardwareConcurrency >= 2) score += 15;
            else score += 10;

            if (this.deviceInfo.memory >= 8) score += 25;
            else if (this.deviceInfo.memory >= 4) score += 20;
            else if (this.deviceInfo.memory >= 2) score += 15;
            else score += 10;

            if (this.deviceInfo.webglSupport) score += 20;

            if (this.deviceInfo.hardwareAcceleration) score += 20;

            if (this.performanceMetrics.fps >= 60) score += 10;
            else if (this.performanceMetrics.fps >= 30) score += 7;
            else if (this.performanceMetrics.fps >= 15) score += 5;
            else score += 2;

            return Math.min(score, 100);
        }

        /**
         * 生成优化建议
         */
        generateOptimizationRecommendations() {
            const recommendations = [];
            const networkScore = this.getNetworkQualityScore();
            const deviceScore = this.getDevicePerformanceScore();

            if (networkScore < 50) {
                if (this.networkInfo.bandwidth < 1000) {
                    recommendations.push({
                        type: 'network',
                        priority: 'high',
                        message: '建议降低视频质量以适应低带宽网络',
                        action: 'reduce_quality'
                    });
                }

                if (this.networkInfo.latency > 500) {
                    recommendations.push({
                        type: 'network',
                        priority: 'medium',
                        message: '建议增加预缓冲时间以应对高延迟',
                        action: 'increase_buffer'
                    });
                }
            }

            if (deviceScore < 50) {
                if (this.deviceInfo.hardwareConcurrency < 4) {
                    recommendations.push({
                        type: 'device',
                        priority: 'high',
                        message: '建议关闭硬件加速以减轻CPU负担',
                        action: 'disable_hardware_accel'
                    });
                }

                if (this.performanceMetrics.fps < 30) {
                    recommendations.push({
                        type: 'device',
                        priority: 'medium',
                        message: '建议降低视频帧率以提升播放流畅度',
                        action: 'reduce_framerate'
                    });
                }
            }

            return recommendations;
        }

        /**
         * 获取完整的性能报告
         */
        getPerformanceReport() {
            return {
                timestamp: Date.now(),
                network: {
                    ...this.networkInfo,
                    qualityScore: this.getNetworkQualityScore()
                },
                device: {
                    ...this.deviceInfo,
                    performanceScore: this.getDevicePerformanceScore()
                },
                metrics: this.performanceMetrics,
                recommendations: this.generateOptimizationRecommendations(),
                history: this.historyData
            };
        }

        /**
         * 清理资源
         */
        destroy() {
            console.log('性能分析器已销毁');
        }
    }

    // =========================================================================
    // 新增模块: 性能监控器模块 (新增模块)
    // =========================================================================
    class PerformanceMonitor {
        constructor(controller) {
            this.controller = controller;

            this.metrics = {
                videoPerformance: new Map(),
                systemPerformance: {
                    fps: [],
                    memory: [],
                    cpu: [],
                    network: []
                },
                optimizationResults: {
                    totalOptimizations: 0,
                    successfulOptimizations: 0,
                    failedOptimizations: 0,
                    averageImprovement: 0
                },
                userExperience: {
                    playbackQuality: 0,
                    bufferingEvents: 0,
                    stallsCount: 0
                }
            };

            this.monitoringConfig = {
                collectInterval: 5000,
                maxHistorySize: 200,
                alertThresholds: {
                    lowFPS: 15,
                    highMemoryUsage: 0.8,
                    highLatency: 500,
                    lowBandwidth: 1000
                }
            };

            this.isMonitoring = false;
            this.monitoringTimers = [];

            // FPS监控状态
            this.fpsMonitor = null;
            this.fpsAnimationFrameId = null;
            this.requestAnimationFrameFn = null;
            this.cancelAnimationFrameFn = null;
        }


        /**
         * 初始化性能监控器
         */
        async initialize() {
            console.log('初始化性能监控器...');

            this.setupPerformanceObservers();
            this.setupVideoEventListeners();
            this.startMonitoring();

            console.log('性能监控器初始化完成');
        }

        /**
         * 设置性能观察器
         */
        setupPerformanceObservers() {
            this.setupFPSObserver();
            this.setupMemoryObserver();
            this.setupNetworkObserver();
        }

        /**
         * 设置FPS观察器
         */
        setupFPSObserver() {
            if (this.fpsMonitor) {
                return;
            }

            const raf = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
            const caf = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame;

            if (typeof raf !== 'function') {
                console.warn('requestAnimationFrame 不可用，跳过FPS监控');
                return;
            }

            this.requestAnimationFrameFn = raf.bind(window);
            this.cancelAnimationFrameFn = typeof caf === 'function' ? caf.bind(window) : null;

            let lastTime = performance.now();
            let frameCount = 0;

            this.fpsMonitor = () => {
                frameCount++;
                const currentTime = performance.now();

                if (currentTime - lastTime >= 1000) {
                    const fps = frameCount;
                    this.addMetric('fps', fps);

                    frameCount = 0;
                    lastTime = currentTime;
                }

                if (this.isMonitoring) {
                    this.fpsAnimationFrameId = this.requestAnimationFrameFn(this.fpsMonitor);
                } else {
                    this.fpsAnimationFrameId = null;
                }
            };

            // 立即安排首次帧检测，保持原有初始化时机
            this.fpsAnimationFrameId = this.requestAnimationFrameFn(this.fpsMonitor);
        }

        /**
         * 设置内存观察器
         */
        setupMemoryObserver() {
            if ('memory' in performance) {
                const monitorMemory = () => {
                    const memory = performance.memory;
                    const memoryInfo = {
                        used: memory.usedJSHeapSize,
                        total: memory.totalJSHeapSize,
                        limit: memory.jsHeapSizeLimit,
                        usage: memory.usedJSHeapSize / memory.jsHeapSizeLimit,
                        timestamp: Date.now()
                    };

                    this.addMetric('memory', memoryInfo);

                    if (memoryInfo.usage > this.monitoringConfig.alertThresholds.highMemoryUsage) {
                        this.triggerAlert('high_memory', memoryInfo);
                    }
                };

                const timer = setInterval(monitorMemory, this.monitoringConfig.collectInterval);
                this.monitoringTimers.push(timer);
            }
        }

        /**
         * 设置网络观察器
         */
        setupNetworkObserver() {
            if ('connection' in navigator) {
                const monitorNetwork = () => {
                    const connection = navigator.connection;
                    const networkInfo = {
                        effectiveType: connection.effectiveType,
                        downlink: connection.downlink,
                        rtt: connection.rtt,
                        saveData: connection.saveData,
                        timestamp: Date.now()
                    };

                    this.addMetric('network', networkInfo);

                    if (connection.rtt > this.monitoringConfig.alertThresholds.highLatency) {
                        this.triggerAlert('high_latency', networkInfo);
                    }

                    if (connection.downlink < this.monitoringConfig.alertThresholds.lowBandwidth) {
                        this.triggerAlert('low_bandwidth', networkInfo);
                    }
                };

                navigator.connection.addEventListener('change', monitorNetwork);

                const timer = setInterval(monitorNetwork, this.monitoringConfig.collectInterval);
                this.monitoringTimers.push(timer);
            }
        }

        /**
         * 设置视频事件监听
         */
        setupVideoEventListeners() {
            this.setupVideoPlaybackListener();
            this.setupVideoBufferingListener();
        }

        /**
         * 设置视频播放监听
         */
        setupVideoPlaybackListener() {
            document.addEventListener('play', (event) => {
                if (event.target.tagName === 'VIDEO') {
                    this.recordVideoEvent(event.target, 'play');
                }
            }, true);

            document.addEventListener('pause', (event) => {
                if (event.target.tagName === 'VIDEO') {
                    this.recordVideoEvent(event.target, 'pause');
                }
            }, true);

            document.addEventListener('ended', (event) => {
                if (event.target.tagName === 'VIDEO') {
                    this.recordVideoEvent(event.target, 'ended');
                }
            }, true);
        }

        /**
         * 设置视频缓冲监听
         */
        setupVideoBufferingListener() {
            document.addEventListener('waiting', (event) => {
                if (event.target.tagName === 'VIDEO') {
                    this.recordVideoEvent(event.target, 'buffering_start');
                    this.metrics.userExperience.bufferingEvents++;
                }
            }, true);

            document.addEventListener('canplay', (event) => {
                if (event.target.tagName === 'VIDEO') {
                    this.recordVideoEvent(event.target, 'buffering_end');
                }
            }, true);

            document.addEventListener('stalled', (event) => {
                if (event.target.tagName === 'VIDEO') {
                    this.recordVideoEvent(event.target, 'stalled');
                    this.metrics.userExperience.stallsCount++;
                }
            }, true);
        }

        /**
         * 记录视频事件
         */
        recordVideoEvent(videoElement, eventType) {
            const videoId = this.generateVideoId(videoElement);

            if (!this.metrics.videoPerformance.has(videoId)) {
                this.metrics.videoPerformance.set(videoId, {
                    element: videoElement,
                    events: [],
                    quality: {},
                    performance: {}
                });
            }

            const videoMetrics = this.metrics.videoPerformance.get(videoId);
            videoMetrics.events.push({
                type: eventType,
                timestamp: Date.now(),
                currentTime: videoElement.currentTime,
                readyState: videoElement.readyState,
                networkState: videoElement.networkState
            });

            console.log(`视频事件记录: ${videoId} - ${eventType}`);
        }

        /**
         * 生成视频ID
         */
        generateVideoId(videoElement) {
            const src = videoElement.src || videoElement.currentSrc || '';
            const className = videoElement.className || '';
            const id = videoElement.id || '';

            const identifier = `${src}-${className}-${id}`;
            let hash = 0;
            for (let i = 0; i < identifier.length; i++) {
                const char = identifier.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }

            return `video_${Math.abs(hash)}`;
        }

        /**
         * 启动监控
         */
        startMonitoring() {
            this.isMonitoring = true;

            if (!this.fpsMonitor) {
                this.setupFPSObserver();
            }

            if (this.fpsMonitor && this.fpsAnimationFrameId === null && typeof this.requestAnimationFrameFn === 'function') {
                this.fpsAnimationFrameId = this.requestAnimationFrameFn(this.fpsMonitor);
            }

            const collectTimer = setInterval(() => {
                this.collectMetrics();
            }, this.monitoringConfig.collectInterval);

            this.monitoringTimers.push(collectTimer);

            console.log('性能监控已启动');
        }

        /**
         * 停止监控
         */
        stopMonitoring() {
            this.isMonitoring = false;

            if (this.fpsAnimationFrameId !== null) {
                if (typeof this.cancelAnimationFrameFn === 'function') {
                    this.cancelAnimationFrameFn(this.fpsAnimationFrameId);
                }
                this.fpsAnimationFrameId = null;
            }

            this.monitoringTimers.forEach(timer => clearInterval(timer));
            this.monitoringTimers = [];

            console.log('性能监控已停止');
        }

        /**
         * 收集性能指标
         */
        collectMetrics() {
            this.collectVideoMetrics();
            this.collectSystemMetrics();
            this.calculateStatistics();
            this.cleanupOldMetrics();
        }

        /**
         * 收集视频性能数据
         */
        collectVideoMetrics() {
            for (const [videoId, videoData] of this.metrics.videoPerformance) {
                const videoElement = videoData.element;

                if (videoElement && videoElement.isConnected) {
                    const performance = {
                        currentTime: videoElement.currentTime,
                        duration: videoElement.duration,
                        buffered: this.getBufferedRanges(videoElement),
                        readyState: videoElement.readyState,
                        networkState: videoElement.networkState,
                        playbackRate: videoElement.playbackRate,
                        volume: videoElement.volume,
                        timestamp: Date.now()
                    };

                    videoData.performance = performance;
                }
            }
        }

        /**
         * 获取缓冲范围
         */
        getBufferedRanges(videoElement) {
            const buffered = videoElement.buffered;
            const ranges = [];

            for (let i = 0; i < buffered.length; i++) {
                ranges.push({
                    start: buffered.start(i),
                    end: buffered.end(i)
                });
            }

            return ranges;
        }

        /**
         * 收集系统性能数据
         */
        collectSystemMetrics() {
            const cpuUsage = this.estimateCPUUsage();
            this.addMetric('cpu', cpuUsage);
        }

        /**
         * 估算CPU使用率
         */
        estimateCPUUsage() {
            const start = performance.now();
            let iterations = 0;

            while (performance.now() - start < 5) {
                Math.random();
                iterations++;
            }

            const baseIterations = 1000000;
            const usage = Math.max(0, Math.min(100, 100 - (iterations / baseIterations) * 100));

            return {
                usage: usage,
                iterations: iterations,
                timestamp: Date.now()
            };
        }

        /**
         * 添加指标数据
         */
        addMetric(type, data) {
            if (!this.metrics.systemPerformance[type]) {
                this.metrics.systemPerformance[type] = [];
            }

            this.metrics.systemPerformance[type].push(data);

            if (this.metrics.systemPerformance[type].length > this.monitoringConfig.maxHistorySize) {
                this.metrics.systemPerformance[type] =
                    this.metrics.systemPerformance[type].slice(-this.monitoringConfig.maxHistorySize);
            }
        }

        /**
         * 计算统计数据
         */
        calculateStatistics() {
            const recentFPS = this.metrics.systemPerformance.fps.slice(-10);
            if (recentFPS.length > 0) {
                const avgFPS = recentFPS.reduce((sum, item) => sum + item, 0) / recentFPS.length;
                this.metrics.systemPerformance.averageFPS = avgFPS;
            }

            const recentMemory = this.metrics.systemPerformance.memory.slice(-10);
            if (recentMemory.length > 0) {
                const avgMemory = recentMemory.reduce((sum, item) => sum + item.usage, 0) / recentMemory.length;
                this.metrics.systemPerformance.averageMemoryUsage = avgMemory;
            }

            this.updateUserExperienceMetrics();
        }

        /**
         * 更新用户体验指标
         */
        updateUserExperienceMetrics() {
            let totalQuality = 0;
            let videoCount = 0;

            for (const [videoId, videoData] of this.metrics.videoPerformance) {
                if (videoData.quality.width && videoData.quality.height) {
                    const pixels = videoData.quality.width * videoData.quality.height;
                    totalQuality += pixels;
                    videoCount++;
                }
            }

            if (videoCount > 0) {
                this.metrics.userExperience.playbackQuality = totalQuality / videoCount;
            }
        }

        /**
         * 清理旧指标数据
         */
        cleanupOldMetrics() {
            const now = Date.now();
            const maxAge = 60 * 60 * 1000;

            for (const type in this.metrics.systemPerformance) {
                if (Array.isArray(this.metrics.systemPerformance[type])) {
                    this.metrics.systemPerformance[type] =
                        this.metrics.systemPerformance[type].filter(item => {
                            return (now - item.timestamp) < maxAge;
                        });
                }
            }

            for (const [videoId, videoData] of this.metrics.videoPerformance) {
                if (!videoData.element || !videoData.element.isConnected) {
                    this.metrics.videoPerformance.delete(videoId);
                }
            }
        }

        /**
         * 触发警告
         */
        triggerAlert(alertType, data) {
            const alert = {
                type: alertType,
                data: data,
                timestamp: Date.now(),
                message: this.getAlertMessage(alertType, data)
            };

            console.warn(`性能警告: ${alert.message}`);
        }

        /**
         * 获取警告消息
         */
        getAlertMessage(alertType, data) {
            switch (alertType) {
                case 'high_memory':
                    return `内存使用过高: ${(data.usage * 100).toFixed(1)}%`;
                case 'high_latency':
                    return `网络延迟过高: ${data.rtt}ms`;
                case 'low_bandwidth':
                    return `带宽过低: ${data.downlink} Mbps`;
                default:
                    return `未知警告: ${alertType}`;
            }
        }

        /**
         * 获取性能报告
         */
        getPerformanceReport() {
            return {
                timestamp: Date.now(),
                systemPerformance: {
                    ...this.metrics.systemPerformance,
                    summary: {
                        averageFPS: this.metrics.systemPerformance.averageFPS || 0,
                        averageMemoryUsage: this.metrics.systemPerformance.averageMemoryUsage || 0,
                        totalVideos: this.metrics.videoPerformance.size
                    }
                },
                optimizationResults: this.metrics.optimizationResults,
                userExperience: this.metrics.userExperience,
                videoMetrics: Array.from(this.metrics.videoPerformance.values())
            };
        }

        /**
         * 更新优化结果
         */
        updateOptimizationResults(result) {
            this.metrics.optimizationResults.totalOptimizations++;

            if (result.success) {
                this.metrics.optimizationResults.successfulOptimizations++;
            } else {
                this.metrics.optimizationResults.failedOptimizations++;
            }

            if (result.improvement) {
                const total = this.metrics.optimizationResults.averageImprovement *
                    (this.metrics.optimizationResults.successfulOptimizations - 1);
                this.metrics.optimizationResults.averageImprovement =
                    (total + result.improvement) / this.metrics.optimizationResults.successfulOptimizations;
            }
        }

        /**
         * 清理资源
         */
        destroy() {
            this.stopMonitoring();
            this.metrics.videoPerformance.clear();
            console.log('性能监控器已销毁');
        }
    }

    // =========================================================================
    // 新增模块: 流媒体播控增强模块 (新增模块)
    // =========================================================================
    class StreamingMediaEnhancer {
        constructor(controller) {
            this.controller = controller;

            // 流媒体配置
            this.config = {
                debugMode: false,
                cacheName: 'video-cache-v1',
                maxCacheEntries: 30,
                minSegmentSizeMB: 0.5,
                maxCacheAgeMs: 5 * 60 * 1000,
                rlTrainingInterval: 60 * 1000,

                // 网络缓冲配置
                networkBufferConfig: {
                    '2g': 15, '3g': 25, '4g': 40, 'slow-2g': 10,
                    'fast-3g': 30, 'lte': 40, '5g': 40, 'unknown': 25
                },

                // 场景配置
                sceneConfig: {
                    isFrequentSwitching: false,
                    switchCacheSize: 15,
                    switchRlTrainingInterval: 120000
                },

                // 设备配置
                deviceConfig: {
                    isLowEnd: (navigator.deviceMemory && navigator.deviceMemory < 4) ||
                        (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4)
                }
            };

            // 全局状态
            this.networkSpeedCache = { value: 15, timestamp: 0 };
            this.protocolParseCache = new Map();
            this.activeManagers = new WeakMap();
            this.cleanupIntervalId = null;

            // MIME类型映射
            this.mimeTypeMap = {
                h264: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
                h265: 'video/mp4; codecs="hvc1.1.L93.B0"',
                av1: 'video/webm; codecs="av01.0.08M.10"',
                vp9: 'video/webm; codecs="vp9"',
                flv: 'video/flv'
            };
        }

        /**
         * 初始化流媒体增强器
         */
        initialize() {
            console.log('初始化流媒体播控增强模块...');

            this.setupStreamingDetection();
            this.setupCacheCleanup();
            this.integrateWithPerformanceAnalyzer();

            console.log('流媒体播控增强模块初始化完成');
        }

        /**
         * 设置流媒体检测
         */
        setupStreamingDetection() {
            // 监听视频元素变化
            this.setupVideoMutationObserver();

            // 检测现有视频元素
            this.detectExistingStreamingVideos();

            // 设置网络监听
            this.setupNetworkMonitoring();
        }

        /**
         * 设置视频变化观察器
         */
        setupVideoMutationObserver() {
            const observer = new MutationObserver((mutations) => {
                let videoSwitchingDetected = false;

                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;

                        const videos = node.tagName === 'VIDEO' ? [node] : node.querySelectorAll('video');
                        if (videos.length > 0) {
                            videoSwitchingDetected = true;
                            videos.forEach(video => this.handleVideoElement(video));
                        }
                    }
                }

                if (videoSwitchingDetected) {
                    this.handleVideoSwitching();
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        /**
         * 检测现有流媒体视频
         */
        detectExistingStreamingVideos() {
            const videos = document.querySelectorAll('video');
            videos.forEach(video => this.handleVideoElement(video));
        }

        /**
         * 处理视频元素
         */
        handleVideoElement(video) {
            // 检查是否已经是流媒体
            if (this.isStreamingMedia(video)) {
                this.enhanceStreamingVideo(video);
            }

            // 监听视频源变化
            this.setupVideoSourceMonitoring(video);
        }

        /**
         * 判断是否为流媒体
         */
        isStreamingMedia(video) {
            const src = video.src || video.currentSrc || '';
            const sources = video.querySelectorAll('source');

            // 检查主源
            if (this.isStreamingSource(src)) {
                return true;
            }

            // 检查source元素
            for (const source of sources) {
                if (this.isStreamingSource(source.src)) {
                    return true;
                }
            }

            return false;
        }

        /**
         * 判断是否为流媒体源
         */
        isStreamingSource(src) {
            if (!src) return false;

            return src.includes('.m3u8') ||
                src.includes('.mpd') ||
                src.includes('.m4s') ||
                src.includes('/hls/') ||
                src.includes('/dash/') ||
                src.includes('manifest') ||
                src.includes('playlist');
        }

        /**
         * 增强流媒体视频
         */
        enhanceStreamingVideo(video) {
            if (this.activeManagers.has(video)) {
                return; // 已经增强过
            }

            try {
                const manager = new StreamingCacheManager(video, this);
                this.activeManagers.set(video, manager);

                console.log('流媒体视频增强已应用:', this.getVideoIdentifier(video));

            } catch (error) {
                console.error('流媒体视频增强失败:', error);
            }
        }

        /**
         * 设置视频源监控
         */
        setupVideoSourceMonitoring(video) {
            const originalSetAttribute = video.setAttribute.bind(video);

            video.setAttribute = function (name, value) {
                originalSetAttribute(name, value);

                if (name === 'src' && this.controller) {
                    setTimeout(() => {
                        this.controller.managers.streamingMedia.handleVideoElement(this);
                    }, 100);
                }
            }.bind({ video, controller: this.controller });

            // 监听load事件
            video.addEventListener('loadstart', () => {
                setTimeout(() => {
                    this.handleVideoElement(video);
                }, 500);
            });
        }

        /**
         * 处理视频切换
         */
        handleVideoSwitching() {
            this.config.sceneConfig.isFrequentSwitching = true;

            setTimeout(() => {
                this.config.sceneConfig.isFrequentSwitching = false;
            }, 5000);
        }

        /**
         * 设置网络监控
         */
        setupNetworkMonitoring() {
            if ('connection' in navigator) {
                navigator.connection.addEventListener('change', () => {
                    this.handleNetworkChange();
                });
            }
        }

        /**
         * 处理网络变化
         */
        handleNetworkChange() {
            console.log('网络状态变化，重新优化流媒体缓存');

            // 更新所有活跃的流媒体管理器
            for (const [video, manager] of this.activeManagers) {
                if (video && document.contains(video)) {
                    manager.adaptToNetworkChange();
                }
            }
        }

        /**
         * 集成性能分析器
         */
        integrateWithPerformanceAnalyzer() {
            if (this.controller.managers.performanceAnalyzer) {
                // 添加流媒体特定的性能指标
                this.enhancePerformanceAnalysis();
            }
        }

        /**
         * 增强性能分析
         */
        enhancePerformanceAnalysis() {
            const originalGetPerformanceReport = this.controller.managers.performanceAnalyzer.getPerformanceReport;

            this.controller.managers.performanceAnalyzer.getPerformanceReport = () => {
                const report = originalGetPerformanceReport.call(this.controller.managers.performanceAnalyzer);

                // 添加流媒体相关指标
                report.streamingMedia = {
                    activeStreams: this.getActiveStreamCount(),
                    totalCacheSize: this.getTotalCacheSize(),
                    networkAdaptation: this.getNetworkAdaptationStats(),
                    streamingProtocols: this.getStreamingProtocols()
                };

                return report;
            };
        }

        /**
         * 获取活跃流数量
         */
        getActiveStreamCount() {
            let count = 0;
            for (const [video, manager] of this.activeManagers) {
                if (video && document.contains(video)) {
                    count++;
                }
            }
            return count;
        }

        /**
         * 获取总缓存大小
         */
        getTotalCacheSize() {
            let totalSize = 0;
            for (const [video, manager] of this.activeManagers) {
                if (manager && typeof manager.getCacheSize === 'function') {
                    totalSize += manager.getCacheSize();
                }
            }
            return totalSize;
        }

        /**
         * 获取网络适配统计
         */
        getNetworkAdaptationStats() {
            const stats = {
                totalAdaptations: 0,
                successfulAdaptations: 0,
                averageBufferSize: 0
            };

            for (const [video, manager] of this.activeManagers) {
                if (manager && typeof manager.getAdaptationStats === 'function') {
                    const managerStats = manager.getAdaptationStats();
                    stats.totalAdaptations += managerStats.totalAdaptations || 0;
                    stats.successfulAdaptations += managerStats.successfulAdaptations || 0;
                    stats.averageBufferSize += managerStats.averageBufferSize || 0;
                }
            }

            const activeCount = this.getActiveStreamCount();
            if (activeCount > 0) {
                stats.averageBufferSize /= activeCount;
            }

            return stats;
        }

        /**
         * 获取流媒体协议统计
         */
        getStreamingProtocols() {
            const protocols = new Map();

            for (const [video, manager] of this.activeManagers) {
                if (manager && manager.currentProtocol) {
                    const protocol = manager.currentProtocol;
                    protocols.set(protocol, (protocols.get(protocol) || 0) + 1);
                }
            }

            return Object.fromEntries(protocols);
        }

        /**
         * 设置缓存清理
         */
        setupCacheCleanup() {
            // 每5分钟清理一次过期缓存
            this.cleanupIntervalId = setInterval(() => {
                this.cleanupExpiredCache();
            }, 5 * 60 * 1000);
        }

        /**
         * 清理过期缓存
         */
        cleanupExpiredCache() {
            const now = Date.now();
            let cleanedCount = 0;

            for (const [video, manager] of this.activeManagers) {
                if (!video || !document.contains(video)) {
                    this.activeManagers.delete(video);
                    cleanedCount++;
                } else if (manager && typeof manager.cleanupExpired === 'function') {
                    manager.cleanupExpired();
                }
            }

            if (cleanedCount > 0) {
                console.log(`清理了 ${cleanedCount} 个过期的流媒体管理器`);
            }
        }

        /**
         * 获取视频标识
         */
        getVideoIdentifier(video) {
            const src = video.src || video.currentSrc || '';
            return src.substring(0, 100) || 'unknown';
        }

        /**
         * 工具函数：网络测速
         */
        async getNetworkSpeed() {
            const CACHE_DURATION = 5 * 60 * 1000;
            const now = Date.now();

            if (now - this.networkSpeedCache.timestamp < CACHE_DURATION) {
                return this.networkSpeedCache.value;
            }

            try {
                if (navigator.connection?.downlink) {
                    const speed = navigator.connection.downlink;
                    this.networkSpeedCache = { value: speed, timestamp: now };
                    return speed;
                }
            } catch (e) {
                // 忽略错误，使用备用方案
            }

            // 备用测速方案
            const testUrl = 'https://httpbin.org/bytes/102400'; // 100KB测试文件
            const startTime = performance.now();

            try {
                const response = await fetch(testUrl, { cache: 'no-store' });
                const blob = await response.blob();
                const duration = (performance.now() - startTime) / 1000;
                const speedMbps = (8 * blob.size) / (1024 * 1024 * duration);

                this.networkSpeedCache = { value: speedMbps, timestamp: now };
                return speedMbps;
            } catch {
                return 15; // 默认值
            }
        }

        /**
         * 检测网络类型
         */
        detectNetworkProfile() {
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            return (conn?.effectiveType || 'unknown').toLowerCase();
        }

        /**
         * 获取自适应缓冲时长
         */
        getAdaptiveBufferDuration() {
            const type = this.detectNetworkProfile();
            const duration = this.config.networkBufferConfig[type] || this.config.networkBufferConfig.unknown;
            return duration;
        }

        /**
         * 销毁清理
         */
        destroy() {
            if (this.cleanupIntervalId) {
                clearInterval(this.cleanupIntervalId);
            }

            // 清理所有活跃的流媒体管理器
            for (const [video, manager] of this.activeManagers) {
                if (manager && typeof manager.destroy === 'function') {
                    manager.destroy();
                }
            }

            this.activeManagers.clear();
            console.log('流媒体播控增强模块已销毁');
        }
    }

    // =========================================================================
    // 流媒体缓存管理器 (新增模块)
    // =========================================================================
    class StreamingCacheManager {
        constructor(video, enhancer) {
            this.video = video;
            this.enhancer = enhancer;
            this.controller = enhancer.controller;

            this.mediaSource = null;
            this.sourceBuffer = null;
            this.segments = [];
            this.cacheMap = new Map();
            this.pendingRequests = new Set();
            this.isInitialized = false;
            this.currentProtocol = null;
            this.abortController = new AbortController();
            this.prefetchLoopId = null;
            this.lastActiveTime = Date.now();

            this.cacheManager = new StreamingCacheStorage();
            this.rlEngine = new StreamingRLStrategyEngine();

            this.initialize();
        }

        /**
         * 初始化流媒体缓存
         */
        async initialize() {
            try {
                await this.initializeMediaSource();
                await this.initializeSourceBuffer();
                this.startPrefetchLoop();
                this.setupEventListeners();

                this.isInitialized = true;
                console.log('流媒体缓存管理器初始化完成');

            } catch (error) {
                console.error('流媒体缓存管理器初始化失败:', error);
            }
        }

        /**
         * 初始化MediaSource
         */
        async initializeMediaSource() {
            this.mediaSource = new MediaSource();
            this.video.src = URL.createObjectURL(this.mediaSource);

            return new Promise((resolve) => {
                this.mediaSource.addEventListener('sourceopen', () => resolve(), { once: true });
            });
        }

        /**
         * 初始化SourceBuffer
         */
        async initializeSourceBuffer() {
            const src = this.video.src || this.video.currentSrc || '';
            if (!src) throw new Error('无法获取视频源');

            // 解析流媒体协议
            const protocolInfo = await this.parseStreamingProtocol(src);
            this.currentProtocol = protocolInfo.protocol;

            this.sourceBuffer = this.mediaSource.addSourceBuffer(protocolInfo.mimeType);
            this.sourceBuffer.mode = 'segments';
            this.segments = protocolInfo.segments;

            console.log(`流媒体协议解析完成: ${this.currentProtocol}, 分片数: ${this.segments.length}`);
        }

        /**
         * 解析流媒体协议
         */
        async parseStreamingProtocol(url) {
            // 检查缓存
            const cached = this.enhancer.protocolParseCache.get(url);
            if (cached && Date.now() - cached.timestamp < 300000) {
                return cached.result;
            }

            try {
                const response = await fetch(url);
                const content = await response.text();

                let result;
                if (url.includes('.m3u8') || content.includes('#EXTM3U')) {
                    result = this.parseHLS(url, content);
                } else if (url.includes('.mpd') || content.includes('<MPD')) {
                    result = this.parseDASH(url, content);
                } else if (url.includes('.m4s')) {
                    result = this.parseMP4Segmented(url, content);
                } else {
                    throw new Error('不支持的流媒体协议: ' + url);
                }

                // 缓存解析结果
                this.enhancer.protocolParseCache.set(url, {
                    result,
                    timestamp: Date.now()
                });

                return result;

            } catch (error) {
                console.error('流媒体协议解析失败:', error);
                throw error;
            }
        }

        /**
         * 解析HLS协议
         */
        parseHLS(url, content) {
            const segments = [];
            const lines = content.split('\n').filter(line => line.trim());
            let seq = 0;

            for (const line of lines) {
                if (!line.startsWith('#') && line.trim()) {
                    const segmentUrl = new URL(line, url).href;
                    segments.push({
                        url: segmentUrl,
                        seq: seq++,
                        duration: 4,
                        startTime: seq * 4
                    });
                }
            }

            return {
                protocol: 'hls',
                segments,
                mimeType: this.enhancer.mimeTypeMap.h264
            };
        }

        /**
         * 解析DASH协议
         */
        parseDASH(url, content) {
            const parser = new DOMParser();
            const xml = parser.parseFromString(content, 'application/xml');
            const segments = [];
            let seq = 0;

            xml.querySelectorAll('SegmentURL').forEach(segment => {
                const media = segment.getAttribute('media');
                if (media) {
                    segments.push({
                        url: new URL(media, url).href,
                        seq: seq++,
                        duration: 4,
                        startTime: seq * 4
                    });
                }
            });

            return {
                protocol: 'dash',
                segments,
                mimeType: this.enhancer.mimeTypeMap.h264
            };
        }

        /**
         * 解析分段MP4
         */
        parseMP4Segmented(url, content) {
            // 简化实现，实际应该解析manifest
            const segments = Array.from({ length: 50 }, (_, i) => ({
                url: `${url}?segment=${i}`,
                seq: i,
                duration: 4,
                startTime: i * 4
            }));

            return {
                protocol: 'mp4-segmented',
                segments,
                mimeType: this.enhancer.mimeTypeMap.h264
            };
        }

        /**
         * 启动预加载循环
         */
        startPrefetchLoop() {
            const prefetch = async () => {
                if (!this.isInitialized) return;

                try {
                    await this.prefetchSegments();
                } catch (error) {
                    console.error('预加载失败:', error);
                }

                this.prefetchLoopId = requestIdleCallback(prefetch, { timeout: 1000 });
            };

            this.prefetchLoopId = requestIdleCallback(prefetch);
        }

        /**
         * 预加载分片
         */
        async prefetchSegments() {
            if (!this.video || this.video.paused) return;

            this.lastActiveTime = Date.now();
            const bufferDuration = this.enhancer.getAdaptiveBufferDuration();
            const currentTime = this.video.currentTime;
            const targetTime = currentTime + bufferDuration;

            // 找出需要预加载的分片
            const segmentsToPrefetch = this.segments.filter(segment =>
                segment.startTime <= targetTime &&
                segment.startTime >= currentTime &&
                !this.cacheMap.has(segment.seq) &&
                !this.pendingRequests.has(segment.seq)
            );

            // 并行预加载（限制并发数）
            const concurrentLimit = 3;
            const chunks = [];

            for (let i = 0; i < segmentsToPrefetch.length; i += concurrentLimit) {
                chunks.push(segmentsToPrefetch.slice(i, i + concurrentLimit));
            }

            for (const chunk of chunks) {
                await Promise.allSettled(
                    chunk.map(segment => this.prefetchSegment(segment))
                );
            }
        }

        /**
         * 预加载单个分片
         */
        async prefetchSegment(segment) {
            this.pendingRequests.add(segment.seq);

            try {
                // 检查缓存
                const cached = await this.cacheManager.get(segment.url);
                if (cached) {
                    this.cacheMap.set(segment.seq, cached);
                    await this.appendToSourceBuffer(cached);
                    return;
                }

                // 网络加载
                const networkSpeed = await this.enhancer.getNetworkSpeed();
                const shouldPrefetch = await this.rlEngine.shouldPrefetch(segment, networkSpeed);

                if (!shouldPrefetch) {
                    return;
                }

                const response = await fetch(segment.url, {
                    signal: this.abortController.signal
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);

                const blob = await response.blob();

                // 缓存分片
                await this.cacheManager.put(segment.url, blob);
                this.cacheMap.set(segment.seq, blob);

                // 添加到SourceBuffer
                await this.appendToSourceBuffer(blob);

            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(`分片 ${segment.seq} 加载失败:`, error);
                }
            } finally {
                this.pendingRequests.delete(segment.seq);
            }
        }

        /**
         * 添加到SourceBuffer
         */
        async appendToSourceBuffer(blob) {
            if (!this.sourceBuffer || this.sourceBuffer.updating) {
                return;
            }

            try {
                const arrayBuffer = await blob.arrayBuffer();

                await new Promise((resolve, reject) => {
                    const onUpdateEnd = () => {
                        this.sourceBuffer.removeEventListener('updateend', onUpdateEnd);
                        resolve();
                    };

                    const onError = (error) => {
                        this.sourceBuffer.removeEventListener('error', onError);
                        reject(error);
                    };

                    this.sourceBuffer.addEventListener('updateend', onUpdateEnd, { once: true });
                    this.sourceBuffer.addEventListener('error', onError, { once: true });

                    this.sourceBuffer.appendBuffer(arrayBuffer);
                });

            } catch (error) {
                console.error('添加到SourceBuffer失败:', error);
            }
        }

        /**
         * 设置事件监听器
         */
        setupEventListeners() {
            this.video.addEventListener('play', () => this.handlePlay());
            this.video.addEventListener('pause', () => this.handlePause());
            this.video.addEventListener('seeking', () => this.handleSeeking());
            this.video.addEventListener('waiting', () => this.handleWaiting());
            this.video.addEventListener('canplay', () => this.handleCanPlay());
        }

        /**
         * 处理播放事件
         */
        handlePlay() {
            this.lastActiveTime = Date.now();
            this.rlEngine.recordPlayEvent();
        }

        /**
         * 处理暂停事件
         */
        handlePause() {
            this.rlEngine.recordPauseEvent();
        }

        /**
         * 处理跳转事件
         */
        handleSeeking() {
            // 跳转时清理当前位置之后的缓存，重新预加载
            const currentTime = this.video.currentTime;

            for (const [seq, blob] of this.cacheMap) {
                const segment = this.segments.find(s => s.seq === seq);
                if (segment && segment.startTime > currentTime + 30) { // 保留30秒缓冲
                    this.cacheMap.delete(seq);
                }
            }
        }

        /**
         * 处理等待事件
         */
        handleWaiting() {
            this.rlEngine.recordStallEvent();
            this.triggerEmergencyPrefetch();
        }

        /**
         * 处理可播放事件
         */
        handleCanPlay() {
            this.rlEngine.recordRecoveryEvent();
        }

        /**
         * 触发紧急预加载
         */
        triggerEmergencyPrefetch() {
            // 紧急情况下，扩大预加载范围
            const emergencyBuffer = this.enhancer.getAdaptiveBufferDuration() * 2;
            const currentTime = this.video.currentTime;
            const targetTime = currentTime + emergencyBuffer;

            const emergencySegments = this.segments.filter(segment =>
                segment.startTime <= targetTime &&
                segment.startTime >= currentTime
            );

            // 立即加载前几个分片
            emergencySegments.slice(0, 5).forEach(segment => {
                if (!this.cacheMap.has(segment.seq) && !this.pendingRequests.has(segment.seq)) {
                    this.prefetchSegment(segment);
                }
            });
        }

        /**
         * 适应网络变化
         */
        adaptToNetworkChange() {
            console.log('适应网络变化，调整流媒体缓存策略');
            this.rlEngine.adaptToNetworkChange();

            // 重新计算预加载策略
            if (this.prefetchLoopId) {
                cancelIdleCallback(this.prefetchLoopId);
                this.startPrefetchLoop();
            }
        }

        /**
         * 获取缓存大小
         */
        getCacheSize() {
            let totalSize = 0;
            for (const blob of this.cacheMap.values()) {
                totalSize += blob.size;
            }
            return totalSize;
        }

        /**
         * 获取适配统计
         */
        getAdaptationStats() {
            return this.rlEngine.getStats();
        }

        /**
         * 清理过期缓存
         */
        cleanupExpired() {
            this.cacheManager.cleanupExpired();

            // 清理长时间未访问的缓存分片
            const now = Date.now();
            if (now - this.lastActiveTime > 10 * 60 * 1000) { // 10分钟无活动
                this.cacheMap.clear();
            }
        }

        /**
         * 销毁管理器
         */
        destroy() {
            if (this.prefetchLoopId) {
                cancelIdleCallback(this.prefetchLoopId);
            }

            this.abortController.abort();
            this.pendingRequests.clear();
            this.cacheMap.clear();

            if (this.sourceBuffer) {
                try {
                    this.mediaSource.removeSourceBuffer(this.sourceBuffer);
                } catch (error) {
                    // 忽略错误
                }
            }

            if (this.mediaSource) {
                try {
                    this.mediaSource.endOfStream();
                } catch (error) {
                    // 忽略错误
                }
            }

            this.rlEngine.destroy();
            this.cacheManager.destroy();

            console.log('流媒体缓存管理器已销毁');
        }
    }

    // =========================================================================
    // 流媒体缓存存储 (新增模块)
    // =========================================================================
    class StreamingCacheStorage {
        constructor() {
            this.cacheMap = new Map();
            this.maxSize = 100 * 1024 * 1024; // 100MB
            this.currentSize = 0;
        }

        async get(url) {
            const entry = this.cacheMap.get(url);
            if (!entry || Date.now() - entry.timestamp > 5 * 60 * 1000) {
                this.cacheMap.delete(url);
                return null;
            }
            return entry.blob;
        }

        async put(url, blob) {
            // 检查大小限制
            if (this.currentSize + blob.size > this.maxSize) {
                this.evictOldEntries();
            }

            this.cacheMap.set(url, {
                blob,
                timestamp: Date.now(),
                size: blob.size
            });

            this.currentSize += blob.size;
        }

        evictOldEntries() {
            const entries = Array.from(this.cacheMap.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);

            while (this.currentSize > this.maxSize * 0.7 && entries.length > 0) {
                const [url, entry] = entries.shift();
                this.cacheMap.delete(url);
                this.currentSize -= entry.size;
            }
        }

        cleanupExpired() {
            const now = Date.now();
            let cleanedCount = 0;

            for (const [url, entry] of this.cacheMap) {
                if (now - entry.timestamp > 5 * 60 * 1000) { // 5分钟过期
                    this.cacheMap.delete(url);
                    this.currentSize -= entry.size;
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                console.log(`清理了 ${cleanedCount} 个过期的缓存条目`);
            }
        }

        destroy() {
            this.cacheMap.clear();
            this.currentSize = 0;
        }
    }

    // =========================================================================
    // 流媒体强化学习策略引擎 (新增模块)
    // =========================================================================
    class StreamingRLStrategyEngine {
        constructor() {
            this.state = {
                networkSpeed: 15,
                pauseCount: 0,
                stallCount: 0,
                recoveryCount: 0
            };

            this.history = [];
            this.lastTrainingTime = 0;
            this.isTraining = false;

            this.stats = {
                totalDecisions: 0,
                successfulPrefetches: 0,
                failedPrefetches: 0,
                totalAdaptations: 0
            };
        }

        async shouldPrefetch(segment, networkSpeed) {
            this.state.networkSpeed = networkSpeed;
            this.stats.totalDecisions++;

            // 简化决策逻辑
            if (networkSpeed < 1) return false; // 网络太差
            if (networkSpeed > 10) return true; // 网络很好

            // 基于历史记录决策
            const recentStalls = this.history.filter(h =>
                h.type === 'stall' &&
                Date.now() - h.timestamp < 30000
            ).length;

            return recentStalls < 3; // 最近30秒卡顿少于3次
        }

        recordPlayEvent() {
            this.history.push({
                type: 'play',
                timestamp: Date.now()
            });
            this.cleanupOldHistory();
        }

        recordPauseEvent() {
            this.state.pauseCount++;
            this.history.push({
                type: 'pause',
                timestamp: Date.now()
            });
            this.cleanupOldHistory();
        }

        recordStallEvent() {
            this.state.stallCount++;
            this.stats.totalAdaptations++;
            this.history.push({
                type: 'stall',
                timestamp: Date.now()
            });
            this.cleanupOldHistory();
        }

        recordRecoveryEvent() {
            this.state.recoveryCount++;
            this.history.push({
                type: 'recovery',
                timestamp: Date.now()
            });
            this.cleanupOldHistory();
        }

        recordSuccessfulPrefetch() {
            this.stats.successfulPrefetches++;
        }

        recordFailedPrefetch() {
            this.stats.failedPrefetches++;
        }

        cleanupOldHistory() {
            const now = Date.now();
            this.history = this.history.filter(h => now - h.timestamp < 5 * 60 * 1000);
        }

        adaptToNetworkChange() {
            this.stats.totalAdaptations++;
            console.log('RL策略引擎适应网络变化');
        }

        getStats() {
            return {
                totalAdaptations: this.stats.totalAdaptations,
                successfulAdaptations: this.stats.successfulPrefetches,
                averageBufferSize: this.stats.successfulPrefetches / Math.max(this.stats.totalDecisions, 1),
                decisionAccuracy: this.stats.successfulPrefetches / Math.max(this.stats.totalDecisions, 1)
            };
        }

        destroy() {
            this.history = [];
            this.stats = {
                totalDecisions: 0,
                successfulPrefetches: 0,
                failedPrefetches: 0,
                totalAdaptations: 0
            };
        }
    }

    // =========================================================================
    // 模块2: 增强版资源分析器模块 (修复版)
    // =========================================================================
    class EnhancedResourceAnalyzer {
        constructor(controller) {
            this.controller = controller;

            // 增强评分权重配置
            this.scoringWeights = {
                resourceType: 0.25,
                videoQuality: 0.3,
                audioQuality: 0.25,
                fileSize: 0.1,
                formatSupport: 0.05,
                accessibility: 0.05
            };

            // 资源类型优先级
            this.typePriority = {
                'video': 100,
                'audio': 85,
                'image': 70,
                'text': 40,
                'other': 20,
                'playlist': 90,
                'subtitle': 60
            };

            // 视频格式优先级
            this.videoFormatPriority = {
                'mp4': 100, 'webm': 95, 'mov': 90, 'avi': 80,
                'mkv': 85, 'flv': 70, 'wmv': 75, '3gp': 60,
                'm3u8': 92, 'mpd': 90, 'ts': 85, 'm4v': 88
            };

            // 音频格式优先级
            this.audioFormatPriority = {
                'mp3': 100, 'aac': 95, 'wav': 90, 'ogg': 85,
                'm4a': 92, 'flac': 88, 'wma': 80, 'opus': 87
            };

            // 图片格式优先级
            this.imageFormatPriority = {
                'jpg': 100, 'jpeg': 100, 'png': 95, 'webp': 92,
                'gif': 80, 'bmp': 75, 'ico': 60, 'svg': 85
            };

            // 质量等级映射
            this.qualityScores = {
                '4K': 95, '2K': 85, '1080p': 75, '720p': 65,
                '480p': 55, '360p': 45, '240p': 35, 'low': 25, 'unknown': 50,
                '320kbps': 90, '256kbps': 85, '192kbps': 75, '128kbps': 65,
                '96kbps': 55, '64kbps': 45, '32kbps': 30
            };

            // 网络性能分析器引用
            this.performanceAnalyzer = null;
        }

        initialize() {
            console.log('增强版资源分析器初始化完成');
            this.performanceAnalyzer = this.controller.managers.performanceAnalyzer;
        }

        /**
         * 增强资源嗅探 - 修复版
         */
        enhancedResourceSniffing(videoElement) {
            const resources = [];

            if (!videoElement) return resources;

            console.log('开始增强资源嗅探...');

            try {
                // 主视频资源 - 只添加有效的HTTP/HTTPS资源
                const mainSrc = videoElement.src || videoElement.currentSrc || '';
                if (mainSrc && this.isDownloadableUrl(mainSrc)) {
                    const mainResource = {
                        id: 'main_video_' + Date.now(),
                        url: mainSrc,
                        title: this.getVideoTitle(videoElement),
                        type: 'video',
                        format: this.detectVideoFormat(videoElement),
                        estimatedSize: this.estimateVideoSize(videoElement),
                        timestamp: Date.now(),
                        videoElement: videoElement,
                        priority: 'high'
                    };
                    resources.push(mainResource);
                }

                // Source元素 - 只添加有效的HTTP/HTTPS资源
                const sources = videoElement.querySelectorAll('source');
                sources.forEach((source, index) => {
                    if (source.src && this.isDownloadableUrl(source.src)) {
                        resources.push({
                            id: 'source_' + index + '_' + Date.now(),
                            url: source.src,
                            title: this.getVideoTitle(videoElement) + '_source_' + index,
                            type: 'video',
                            format: this.detectFormatFromType(source.type),
                            estimatedSize: this.estimateVideoSize(videoElement),
                            timestamp: Date.now(),
                            videoElement: videoElement,
                            priority: 'medium'
                        });
                    }
                });

                // 海报图片 - 只添加有效的HTTP/HTTPS资源
                if (videoElement.poster && this.isDownloadableUrl(videoElement.poster)) {
                    resources.push({
                        id: 'poster_' + Date.now(),
                        url: videoElement.poster,
                        title: this.getVideoTitle(videoElement) + '_poster',
                        type: 'image',
                        format: this.detectImageFormatFromUrl(videoElement.poster),
                        estimatedSize: 1024 * 1024,
                        timestamp: Date.now(),
                        videoElement: videoElement,
                        priority: 'low'
                    });
                }

                console.log(`资源嗅探完成，共发现 ${resources.length} 个可下载资源`);

            } catch (error) {
                console.error('资源嗅探失败:', error);
            }

            return resources;
        }

        /**
         * 检查URL是否可下载
         */
        isDownloadableUrl(url) {
            if (!url) return false;

            // 排除blob、data URL等不可直接下载的资源
            if (url.startsWith('blob:') || url.startsWith('data:')) {
                return false;
            }

            // 只允许HTTP/HTTPS协议
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                return false;
            }

            return true;
        }

        /**
         * 分析资源并智能排序
         */
        analyzeResources(resources) {
            if (!resources || resources.length === 0) {
                return [];
            }

            console.log(`开始分析 ${resources.length} 个资源`);

            // 分析每个资源
            const analyzed = resources.map(resource => this.analyzeSingleResource(resource));

            // 智能排序：视频>音频>图片，同类型按质量排序
            const sortedResources = this.intelligentResourceSorting(analyzed);

            // 记录分析结果
            this.logAnalysisResults(sortedResources);

            return sortedResources;
        }

        /**
         * 分析单个资源
         */
        analyzeSingleResource(resource) {
            let totalScore = 0;
            const breakdown = {};

            // 资源类型评分
            breakdown.typeScore = this.scoreResourceType(resource);
            totalScore += breakdown.typeScore;

            // 根据资源类型进行质量评分
            if (resource.type === 'video') {
                breakdown.qualityScore = this.scoreVideoQuality(resource);
                totalScore += breakdown.qualityScore;
            } else if (resource.type === 'audio') {
                breakdown.qualityScore = this.scoreAudioQuality(resource);
                totalScore += breakdown.qualityScore;
            } else if (resource.type === 'image') {
                breakdown.qualityScore = this.scoreImageQuality(resource);
                totalScore += breakdown.qualityScore;
            } else {
                breakdown.qualityScore = 0;
            }

            // 文件大小评分
            breakdown.sizeScore = this.scoreFileSize(resource);
            totalScore += breakdown.sizeScore;

            // 格式支持评分
            breakdown.formatScore = this.scoreFormatSupport(resource);
            totalScore += breakdown.formatScore;

            // 可访问性评分
            breakdown.accessibilityScore = this.scoreAccessibility(resource);
            totalScore += breakdown.accessibilityScore;

            // 基于性能的智能调整
            if (this.performanceAnalyzer) {
                const adjustedScore = this.adjustScoreByPerformance(totalScore, resource);
                totalScore = adjustedScore;
            }

            const result = {
                resource: resource,
                score: Math.min(Math.round(totalScore), 100),
                breakdown: breakdown,
                technicalInfo: this.getTechnicalInfo(resource),
                downloadPriority: this.calculateDownloadPriority(resource, totalScore)
            };

            return result;
        }

        /**
         * 智能资源排序
         */
        intelligentResourceSorting(analyzedResources) {
            return analyzedResources.sort((a, b) => {
                // 首先按下载优先级排序
                if (a.downloadPriority !== b.downloadPriority) {
                    return b.downloadPriority - a.downloadPriority;
                }

                // 然后按分数排序
                if (a.score !== b.score) {
                    return b.score - a.score;
                }

                // 最后按文件大小（偏好适中大小）
                const sizeA = a.resource.estimatedSize || 0;
                const sizeB = b.resource.estimatedSize || 0;
                return Math.abs(sizeA - 50 * 1024 * 1024) - Math.abs(sizeB - 50 * 1024 * 1024);
            });
        }

        /**
         * 计算下载优先级
         */
        calculateDownloadPriority(resource, score) {
            let priority = score;

            // 资源类型优先级调整
            switch (resource.type) {
                case 'video':
                    priority *= 1.2;
                    break;
                case 'audio':
                    priority *= 1.1;
                    break;
                case 'image':
                    priority *= 0.8;
                    break;
            }

            return Math.min(priority, 100);
        }

        /**
         * 资源类型评分
         */
        scoreResourceType(resource) {
            const baseScore = this.typePriority[resource.type] || this.typePriority.other;
            return baseScore * this.scoringWeights.resourceType;
        }

        /**
         * 视频质量评分
         */
        scoreVideoQuality(resource) {
            const quality = this.detectVideoQuality(resource);
            const qualityScore = this.qualityScores[quality] || 50;

            // 比特率评分
            const bitrateScore = this.scoreVideoBitrate(resource);

            // 编码效率评分
            const codecScore = this.scoreVideoCodec(resource);

            return (qualityScore * 0.6 + bitrateScore * 0.3 + codecScore * 0.1) * this.scoringWeights.videoQuality;
        }

        /**
         * 音频质量评分
         */
        scoreAudioQuality(resource) {
            const quality = this.detectAudioQuality(resource);
            const qualityScore = this.qualityScores[quality] || 50;

            // 音频格式评分
            const format = this.detectAudioFormat(resource);
            const formatScore = this.audioFormatPriority[format] || 70;

            return (qualityScore * 0.7 + formatScore * 0.3) * this.scoringWeights.audioQuality;
        }

        /**
         * 图片质量评分
         */
        scoreImageQuality(resource) {
            const dimensions = this.getImageDimensions(resource);
            let qualityScore = 50;

            if (dimensions) {
                const megapixels = (dimensions.width * dimensions.height) / 1000000;
                if (megapixels > 8) qualityScore = 90;
                else if (megapixels > 2) qualityScore = 75;
                else if (megapixels > 0.5) qualityScore = 60;
            }

            // 图片格式评分
            const format = this.detectImageFormat(resource);
            const formatScore = this.imageFormatPriority[format] || 70;

            return (qualityScore * 0.6 + formatScore * 0.4) * 0.8;
        }

        /**
         * 文件大小评分
         */
        scoreFileSize(resource) {
            if (!resource.estimatedSize) return 50 * this.scoringWeights.fileSize;

            const sizeMB = resource.estimatedSize / (1024 * 1024);
            let sizeScore = 50;

            // 根据资源类型调整理想大小范围
            let idealMin, idealMax;
            switch (resource.type) {
                case 'video':
                    idealMin = 1; idealMax = 500;
                    break;
                case 'audio':
                    idealMin = 0.1; idealMax = 50;
                    break;
                case 'image':
                    idealMin = 0.01; idealMax = 10;
                    break;
                default:
                    idealMin = 0.1; idealMax = 100;
            }

            if (sizeMB < idealMin) sizeScore = 30;
            else if (sizeMB > idealMax) sizeScore = 40;
            else if (sizeMB < idealMax * 0.1) sizeScore = 80;
            else if (sizeMB < idealMax * 0.5) sizeScore = 90;
            else sizeScore = 70;

            return sizeScore * this.scoringWeights.fileSize;
        }

        /**
         * 格式支持评分
         */
        scoreFormatSupport(resource) {
            let formatScore = 70;
            const format = resource.format || this.detectFormatFromUrl(resource.url);

            switch (resource.type) {
                case 'video':
                    formatScore = this.videoFormatPriority[format] || 60;
                    break;
                case 'audio':
                    formatScore = this.audioFormatPriority[format] || 65;
                    break;
                case 'image':
                    formatScore = this.imageFormatPriority[format] || 70;
                    break;
            }

            return formatScore * this.scoringWeights.formatSupport;
        }

        /**
         * 可访问性评分
         */
        scoreAccessibility(resource) {
            let accessibilityScore = 50;

            if (resource.url) {
                if (resource.url.startsWith('blob:')) {
                    accessibilityScore = 20;
                } else if (resource.url.startsWith('data:')) {
                    accessibilityScore = 30;
                } else if (resource.url.startsWith('http')) {
                    accessibilityScore = 80;
                    if (resource.url.startsWith('https')) {
                        accessibilityScore = 90;
                    }
                }
            }

            return Math.min(accessibilityScore, 100) * this.scoringWeights.accessibility;
        }

        /**
         * 基于性能调整评分
         */
        adjustScoreByPerformance(baseScore, resource) {
            if (!this.performanceAnalyzer) return baseScore;

            const networkScore = this.performanceAnalyzer.getNetworkQualityScore();
            const deviceScore = this.performanceAnalyzer.getDevicePerformanceScore();

            let adjustedScore = baseScore;

            // 网络状况差时的偏好
            if (networkScore < 40) {
                // 偏好小文件和流式格式
                const sizeMB = (resource.estimatedSize || 0) / (1024 * 1024);
                if (sizeMB > 100) adjustedScore *= 0.7;
                else if (sizeMB < 10) adjustedScore *= 1.2;

                // 流式格式在差网络下更有优势
                const format = resource.format || this.detectFormatFromUrl(resource.url);
                if (format === 'm3u8' || format === 'mpd') {
                    adjustedScore *= 1.15;
                }
            }

            // 设备性能差时的偏好
            if (deviceScore < 60) {
                // 偏好兼容性好的格式
                const format = resource.format || this.detectFormatFromUrl(resource.url);
                if (format === 'mp4' || format === 'mp3' || format === 'jpg') {
                    adjustedScore *= 1.1;
                } else if (format === 'webm' || format === 'ogg' || format === 'webp') {
                    adjustedScore *= 0.9;
                }
            }

            return Math.min(adjustedScore, 100);
        }

        // =========================================================================
        // 工具方法
        // =========================================================================

        detectVideoQuality(resource) {
            if (resource.videoElement) {
                const width = resource.videoElement.videoWidth || resource.videoElement.width;
                const height = resource.videoElement.videoHeight || resource.videoElement.height;

                if (width && height) {
                    if (height >= 2160) return '4K';
                    if (height >= 1440) return '2K';
                    if (height >= 1080) return '1080p';
                    if (height >= 720) return '720p';
                    if (height >= 480) return '480p';
                    if (height >= 360) return '360p';
                    return 'low';
                }
            }

            // 从URL推断
            const url = (resource.url || '').toLowerCase();
            if (url.includes('4k') || url.includes('2160')) return '4K';
            if (url.includes('2k') || url.includes('1440')) return '2K';
            if (url.includes('1080') || url.includes('fullhd')) return '1080p';
            if (url.includes('720') || url.includes('hd')) return '720p';
            if (url.includes('480')) return '480p';
            if (url.includes('360')) return '360p';

            return 'unknown';
        }

        detectAudioQuality(resource) {
            const url = (resource.url || '').toLowerCase();
            if (url.includes('320')) return '320kbps';
            if (url.includes('256')) return '256kbps';
            if (url.includes('192')) return '192kbps';
            if (url.includes('128')) return '128kbps';
            if (url.includes('96')) return '96kbps';
            if (url.includes('64')) return '64kbps';
            return '128kbps';
        }

        detectVideoFormat(videoElement) {
            const src = videoElement.src || videoElement.currentSrc;
            return this.detectFormatFromUrl(src);
        }

        detectAudioFormat(resource) {
            const format = resource.format || this.detectFormatFromUrl(resource.url);
            return format === 'mp4' ? 'aac' : format;
        }

        detectImageFormat(resource) {
            const format = resource.format || this.detectFormatFromUrl(resource.url);
            return this.imageFormatPriority[format] ? format : 'jpg';
        }

        detectImageFormatFromUrl(url) {
            const format = this.detectFormatFromUrl(url);
            return this.imageFormatPriority[format] ? format : 'jpg';
        }

        detectFormatFromUrl(url) {
            if (!url) return 'unknown';

            // 处理流式格式
            if (url.includes('.m3u8')) return 'm3u8';
            if (url.includes('.mpd')) return 'mpd';
            if (url.includes('.ts')) return 'ts';

            const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
            return match ? match[1].toLowerCase() : 'unknown';
        }

        detectFormatFromType(type) {
            if (!type) return 'unknown';
            if (type.includes('mp4')) return 'mp4';
            if (type.includes('webm')) return 'webm';
            if (type.includes('ogg')) return 'ogg';
            if (type.includes('mpegurl')) return 'm3u8';
            if (type.includes('dash+xml')) return 'mpd';
            return 'unknown';
        }

        getVideoTitle(videoElement) {
            try {
                let title = videoElement.getAttribute('title') ||
                    videoElement.getAttribute('aria-label') ||
                    document.title;

                return title ? title.substring(0, 100) : 'video_download';
            } catch (e) {
                return document.title || 'video_download';
            }
        }

        estimateVideoSize(videoElement) {
            const duration = videoElement.duration || 180;
            const bitrate = this.estimateVideoBitrate(videoElement);
            return (bitrate * duration * 125) / 8;
        }

        estimateVideoBitrate(videoElement) {
            const width = videoElement.videoWidth || 720;
            const height = videoElement.videoHeight || 480;

            if (height >= 2160) return 8000000;
            if (height >= 1440) return 5000000;
            if (height >= 1080) return 3000000;
            if (height >= 720) return 1500000;
            if (height >= 480) return 750000;
            return 500000;
        }

        scoreVideoBitrate(resource) {
            const bitrate = this.estimateVideoBitrate(resource.videoElement);
            if (bitrate > 5000000) return 95;
            if (bitrate > 2000000) return 85;
            if (bitrate > 1000000) return 75;
            if (bitrate > 500000) return 65;
            return 55;
        }

        scoreVideoCodec(resource) {
            const url = (resource.url || '').toLowerCase();
            if (url.includes('h265') || url.includes('hevc')) return 90;
            if (url.includes('h264') || url.includes('avc')) return 85;
            if (url.includes('vp9')) return 80;
            if (url.includes('vp8')) return 70;
            return 75;
        }

        getImageDimensions(resource) {
            // 在实际实现中，可能需要预加载图片获取尺寸
            return null;
        }

        getTechnicalInfo(resource) {
            return {
                format: resource.format || this.detectFormatFromUrl(resource.url),
                type: resource.type,
                estimatedSize: resource.estimatedSize,
                url: resource.url,
                priority: resource.priority
            };
        }

        isBlobOrDataUrl(url) {
            return url.startsWith('blob:') || url.startsWith('data:');
        }

        logAnalysisResults(sortedResources) {
            console.group('资源分析结果');
            sortedResources.forEach((item, index) => {
                console.log(`${index + 1}. [${item.resource.type}] ${item.resource.url} - 评分: ${item.score}`);
            });
            console.groupEnd();
        }
    }
    // =========================================================================
    // 模块3: 增强版下载管理器模块 (完整重写)
    // =========================================================================
    class EnhancedDownloadManager {
        constructor(controller) {
            this.controller = controller;
            this.isDownloaderInitialized = false;
            this.downloadQueue = [];
            this.activeDownloads = new Map();
            this.maxConcurrentDownloads = this.controller.config.download.concurrentDownloads || 2;

            // 下载统计
            this.downloadStats = {
                totalAttempted: 0,
                successful: 0,
                failed: 0,
                currentType: null
            };
        }

        initialize() {
            this.isDownloaderInitialized = true;
            console.log('增强版下载管理器初始化完成');
        }

        /**
         * 智能下载最佳资源 - 增强版
         */
        async downloadBestResource(videoElement) {
            if (!this.isDownloaderInitialized) {
                this._showNotification('错误', '下载器未初始化');
                return false;
            }

            console.log('开始智能资源下载流程...');

            // 增强资源嗅探
            const resources = this.controller.managers.resourceAnalyzer.enhancedResourceSniffing(videoElement);
            if (resources.length === 0) {
                this._showNotification('提示', '当前视频没有发现可下载的资源');
                return false;
            }

            // 分析资源并智能排序
            const analyzedResources = this.controller.managers.resourceAnalyzer.analyzeResources(resources);

            console.log(`资源分析完成，共 ${analyzedResources.length} 个资源，按优先级排序`);

            // 智能下载策略：只下载最佳资源，失败时降级
            const success = await this.intelligentDownloadStrategy(analyzedResources);

            if (success) {
                // 成功提示已经在下载过程中显示，这里不需要重复
            } else {
                this._showNotification('下载失败', '所有资源都无法下载，请检查网络或资源权限');
            }

            return success;
        }

        /**
         * 智能下载策略
         */
        async intelligentDownloadStrategy(analyzedResources) {
            // 只下载评分最高的一个资源
            let bestResource = null;
            let bestResourceInfo = null;
            let highestScore = -1;

            // 在所有资源中找到评分最高的
            analyzedResources.forEach(item => {
                if (item.score > highestScore) {
                    highestScore = item.score;
                    bestResource = item.resource;
                    bestResourceInfo = item;
                }
            });

            if (bestResource) {
                // 显示详细的资源信息提示
                const resourceDetails = this._getResourceDetails(bestResource, bestResourceInfo);
                this._showNotification('下载', resourceDetails);

                console.log(`选择最佳资源下载: ${bestResource.url}, 评分: ${highestScore}`);
                const success = await this.downloadResource(bestResource, bestResourceInfo);

                if (success) {
                    this.downloadStats.successful++;
                    return true;
                } else {
                    // 最佳资源下载失败，尝试其他高评分资源
                    console.log('最佳资源下载失败，尝试其他资源...');
                    this._showNotification('下载状态', '最佳资源下载失败，正在尝试其他高质量资源...');
                    return await this.fallbackDownloadStrategy(analyzedResources, bestResource);
                }
            }

            return false;
        }

        /**
         * 获取资源详细信息
         */
        _getResourceDetails(resource, resourceInfo) {
            const fileSize = this._formatFileSize(resource.estimatedSize);
            const quality = this._getQualityDescription(resource, resourceInfo);
            const format = resource.format || '未知格式';
            const score = resourceInfo ? resourceInfo.score : '未知';

            return ` ${score}分 |  ${quality} |  ${fileSize} |  ${format}`;
        }

        /**
         * 格式化文件大小
         */
        _formatFileSize(bytes) {
            if (!bytes || bytes === 0) return '未知大小';

            const units = ['B', 'KB', 'MB', 'GB'];
            let size = bytes;
            let unitIndex = 0;

            while (size >= 1024 && unitIndex < units.length - 1) {
                size /= 1024;
                unitIndex++;
            }

            return `${size.toFixed(1)} ${units[unitIndex]}`;
        }

        /**
         * 获取质量描述
         */
        _getQualityDescription(resource, resourceInfo) {
            if (resource.type === 'video') {
                const quality = this.controller.managers.resourceAnalyzer.detectVideoQuality(resource);
                return this._getVideoQualityDescription(quality);
            } else if (resource.type === 'audio') {
                const quality = this.controller.managers.resourceAnalyzer.detectAudioQuality(resource);
                return this._getAudioQualityDescription(quality);
            } else if (resource.type === 'image') {
                return '图片资源';
            }

            return '普通资源';
        }

        /**
         * 获取视频质量描述
         */
        _getVideoQualityDescription(quality) {
            const qualityMap = {
                '4K': '超清4K',
                '2K': '2K高清',
                '1080p': '全高清1080P',
                '720p': '高清720P',
                '480p': '标清480P',
                '360p': '流畅360P',
                '240p': '低清240P',
                'low': '低质量',
                'unknown': '未知质量'
            };

            return qualityMap[quality] || quality;
        }

        /**
         * 获取音频质量描述
         */
        _getAudioQualityDescription(quality) {
            const qualityMap = {
                '320kbps': '高质量320kbps',
                '256kbps': '高质量256kbps',
                '192kbps': '标准192kbps',
                '128kbps': '标准128kbps',
                '96kbps': '普通96kbps',
                '64kbps': '普通64kbps',
                '32kbps': '低质量32kbps'
            };

            return qualityMap[quality] || quality;
        }

        /**
         * 备用下载策略
         */
        async fallbackDownloadStrategy(analyzedResources, excludedResource) {
            // 排除已经尝试过的最佳资源，按评分排序其他资源
            const otherResources = analyzedResources
                .filter(item => item.resource !== excludedResource)
                .sort((a, b) => b.score - a.score);

            console.log(`备用下载策略: 尝试 ${otherResources.length} 个其他资源`);

            for (let i = 0; i < otherResources.length; i++) {
                const resourceInfo = otherResources[i];
                const resource = resourceInfo.resource;

                this.downloadStats.totalAttempted++;

                // 显示备用资源的详细信息
                const resourceDetails = this._getResourceDetails(resource, resourceInfo);
                this._showNotification(`尝试备用资源 ${i + 1}`, resourceDetails);

                console.log(`尝试备用资源 ${i + 1}/${otherResources.length}:`, {
                    url: resource.url,
                    score: resourceInfo.score,
                    type: resource.type
                });

                const success = await this.downloadResource(resource, resourceInfo);

                if (success) {
                    this.downloadStats.successful++;
                    this._showNotification('下载成功', '备用资源下载完成');
                    console.log('备用资源下载成功');
                    return true;
                } else {
                    this.downloadStats.failed++;
                    console.log('备用资源下载失败，继续尝试下一个...');
                    await this.delay(300); // 短暂延迟
                }
            }

            console.log('所有备用资源下载尝试失败');
            return false;
        }

        /**
         * 按资源类型分组
         */
        groupResourcesByType(analyzedResources) {
            const groups = {
                video: [],
                audio: [],
                image: []
            };

            analyzedResources.forEach(item => {
                const type = item.resource.type;
                if (groups[type]) {
                    groups[type].push(item);
                }
            });

            // 每个组内按评分排序
            Object.values(groups).forEach(group => {
                group.sort((a, b) => b.score - a.score);
            });

            return groups;
        }

        /**
         * 增强资源下载方法
         */
        async downloadResource(resource, resourceInfo = null) {
            return new Promise((resolve) => {
                if (!resource || !resource.url) {
                    console.log('资源无效');
                    resolve(false);
                    return;
                }

                const filename = this.generateFilename(resource);

                console.log(`开始下载: ${filename}`);

                try {
                    if (typeof GM_download !== 'undefined') {
                        GM_download({
                            url: resource.url,
                            name: filename,
                            headers: this.getDownloadHeaders(resource.url, resource.type),
                            onload: (response) => {
                                if (response.status === 200) {
                                    console.log(`下载成功: ${filename}`);

                                    // 下载成功时显示详细信息
                                    if (resourceInfo) {
                                        const resourceDetails = this._getResourceDetails(resource, resourceInfo);
                                        this._showNotification('下载完成', `✅ ${resourceDetails}`);
                                    } else {
                                        this._showNotification('下载完成', `✅ 文件: ${filename}`);
                                    }

                                    resolve(true);
                                } else {
                                    console.log(`下载失败，状态码: ${response.status}`);
                                    resolve(false);
                                }
                            },
                            onerror: (error) => {
                                console.log(`下载错误: ${error.error}`);
                                resolve(false);
                            },
                            ontimeout: () => {
                                console.log('下载超时');
                                resolve(false);
                            }
                        });
                    } else {
                        // 备用下载方法
                        this.fallbackDownload(resource, filename)
                            .then(success => resolve(success))
                            .catch(() => resolve(false));
                    }
                } catch (error) {
                    console.log(`下载异常: ${error.message}`);
                    resolve(false);
                }
            });
        }

        /**
         * 备用下载方法
         */
        async fallbackDownload(resource, filename) {
            return new Promise((resolve) => {
                try {
                    const a = document.createElement('a');
                    a.href = resource.url;
                    a.download = filename;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();

                    // 给下载一些时间
                    setTimeout(() => {
                        document.body.removeChild(a);
                        console.log(`备用下载方法完成: ${filename}`);
                        resolve(true);
                    }, 1000);

                } catch (error) {
                    console.log(`备用下载失败: ${error.message}`);
                    resolve(false);
                }
            });
        }

        /**
         * 生成文件名
         */
        generateFilename(resource) {
            const ext = this.getFileExtension(resource.url, resource.type);
            let name = resource.title || 'download';

            // 清理文件名
            name = name.replace(/[<>:"/\\|?*]/g, '_')
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .substring(0, 100);

            const timestamp = new Date().toISOString()
                .replace(/[:.]/g, '-')
                .split('T')[0];

            const typeSuffix = this.getTypeSuffix(resource.type);

            return `${name}_${typeSuffix}_${timestamp}.${ext}`;
        }

        /**
         * 获取类型后缀
         */
        getTypeSuffix(type) {
            const suffixes = {
                'video': 'video',
                'audio': 'audio',
                'image': 'image'
            };
            return suffixes[type] || 'file';
        }

        /**
         * 获取文件扩展名
         */
        getFileExtension(url, type) {
            // 从URL检测
            if (url.includes('.mp4')) return 'mp4';
            if (url.includes('.webm')) return 'webm';
            if (url.includes('.mp3')) return 'mp3';
            if (url.includes('.aac')) return 'aac';
            if (url.includes('.wav')) return 'wav';
            if (url.includes('.jpg') || url.includes('.jpeg')) return 'jpg';
            if (url.includes('.png')) return 'png';
            if (url.includes('.webp')) return 'webp';
            if (url.includes('.gif')) return 'gif';

            // 根据类型回退
            switch (type) {
                case 'video': return 'mp4';
                case 'audio': return 'mp3';
                case 'image': return 'jpg';
                default: return 'mp4';
            }
        }

        /**
         * 获取下载头信息
         */
        getDownloadHeaders(url, resourceType) {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': window.location.href,
                'Origin': window.location.origin
            };

            // 平台特定头信息
            const hostname = new URL(url).hostname;
            if (hostname.includes('douyin.com') || hostname.includes('tiktok.com')) {
                headers['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1';
            }

            // 资源类型特定头信息
            if (resourceType === 'video' || resourceType === 'audio') {
                headers['Range'] = 'bytes=0-';
            }

            return headers;
        }

        /**
         * 检查是否有可下载资源
         */
        hasDownloadableResources(videoElement) {
            if (!videoElement) return false;

            // 基础检查
            const src = videoElement.src || videoElement.currentSrc || '';
            if (src && !this.isBlobOrDataUrl(src)) {
                return true;
            }

            if (videoElement.poster) return true;

            if (videoElement.querySelectorAll('source').length > 0) return true;

            // 增强检查：通过资源分析检查
            try {
                const resources = this.controller.managers.resourceAnalyzer.enhancedResourceSniffing(videoElement);
                return resources.length > 0;
            } catch (error) {
                console.error('资源检查失败:', error);
                return false;
            }
        }

        /**
         * 工具方法
         */
        isBlobOrDataUrl(url) {
            return url.startsWith('blob:') || url.startsWith('data:');
        }

        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        getDownloadStats() {
            return { ...this.downloadStats };
        }

        _showNotification(title, text) {
            if (typeof GM_notification !== 'undefined') {
                GM_notification({
                    title: title,
                    text: text,
                    timeout: 4000, // 稍微延长显示时间以便阅读详细信息
                    silent: true
                });
            } else {
                console.log(`${title}: ${text}`);
            }
        }
    }
    // =========================================================================
    // 模块4: 增强版视频管理核心模块 (完整增强)
    // =========================================================================
    class EnhancedVideoManager {
        constructor(controller) {
            this.controller = controller;
            this.observer = null;
            this.checkInterval = null;
            this.videoStates = new Map();

            // 新增：性能分析器引用
            this.performanceAnalyzer = null;
            this.performanceMonitor = null;

            // 新增：优化策略
            this.optimizationStrategies = {
                adaptiveBuffer: true,
                smartPreload: true,
                qualityAdjustment: true,
                hardwareAcceleration: true,
                networkAdaptive: true,
                memoryOptimized: true
            };

            // 新增：视频性能数据
            this.videoPerformance = new Map();

            // 新增：视频事件监听器
            this.videoEventListeners = new Map();

            // 新增：缓冲优化参数
            this.bufferConfig = {
                minBufferSize: 5,
                maxBufferSize: 60,
                networkFactor: 1.0,
                deviceFactor: 1.0
            };

            // 新增：播放质量跟踪
            this.qualityMetrics = {
                bufferingEvents: 0,
                stallEvents: 0,
                qualityChanges: 0,
                averageBitrate: 0
            };
        }

        initialize() {
            this.setupPersistentObserver();
            this.setupStableInterval();
            this._restoreAllVideosPlaybackPosition();

            // 获取性能分析器实例
            this.performanceAnalyzer = this.controller.managers.performanceAnalyzer;
            this.performanceMonitor = this.controller.managers.performanceMonitor;

            // 应用初始优化策略
            this.applyInitialOptimizations();

            console.log('增强版视频管理器初始化完成');
        }

        // 新增：应用初始优化
        applyInitialOptimizations() {
            if (!this.performanceAnalyzer) return;

            const networkScore = this.performanceAnalyzer.getNetworkQualityScore();
            const deviceScore = this.performanceAnalyzer.getDevicePerformanceScore();

            // 根据网络和设备状况调整优化策略
            if (networkScore < 40) {
                this.optimizationStrategies.adaptiveBuffer = true;
                this.optimizationStrategies.qualityAdjustment = true;
                this.optimizationStrategies.networkAdaptive = true;
            } else {
                this.optimizationStrategies.qualityAdjustment = false;
            }

            if (deviceScore < 50) {
                this.optimizationStrategies.hardwareAcceleration = false;
                this.optimizationStrategies.memoryOptimized = true;
            }

            // 更新缓冲配置
            this.updateBufferConfiguration(networkScore, deviceScore);

            console.log('初始优化策略:', this.optimizationStrategies);
            console.log('缓冲配置:', this.bufferConfig);
        }

        // 新增：更新缓冲配置
        updateBufferConfiguration(networkScore, deviceScore) {
            // 网络状况影响缓冲大小
            if (networkScore < 30) {
                this.bufferConfig.networkFactor = 1.5; // 网络差时增加缓冲
            } else if (networkScore > 80) {
                this.bufferConfig.networkFactor = 0.7; // 网络好时减少缓冲
            } else {
                this.bufferConfig.networkFactor = 1.0;
            }

            // 设备性能影响缓冲大小
            if (deviceScore < 40) {
                this.bufferConfig.deviceFactor = 0.8; // 设备差时减少缓冲
            } else {
                this.bufferConfig.deviceFactor = 1.0;
            }
        }

        // 增强视频切换处理
        _handleVideoSwitch(newVideo) {
            if (!newVideo) return;

            const oldVideo = this.controller.state.currentVideo;

            // 保存旧视频状态
            if (oldVideo && oldVideo !== newVideo) {
                this.saveVideoState(oldVideo);
                this.removeVideoEventListeners(oldVideo);
            }

            // 更新当前视频
            this.controller.setState({
                currentVideo: newVideo,
                previousVideo: oldVideo
            });

            // 新增：应用视频优化
            this.optimizeVideoPlayback(newVideo);

            // 新增：设置视频事件监听
            this.setupVideoEventListeners(newVideo);

            // 同步播放状态
            this.syncVideoState(newVideo);

            console.log(`视频切换: ${this.getVideoIdentifier(oldVideo)} -> ${this.getVideoIdentifier(newVideo)}`);
        }

        // 新增：优化视频播放
        optimizeVideoPlayback(video) {
            if (!this.performanceAnalyzer) return;

            const videoId = this._getVideoUniqueId(video);
            const networkScore = this.performanceAnalyzer.getNetworkQualityScore();
            const deviceScore = this.performanceAnalyzer.getDevicePerformanceScore();

            console.log(`优化视频播放: ${videoId}, 网络评分: ${networkScore}, 设备评分: ${deviceScore}`);

            // 应用缓冲优化
            if (this.optimizationStrategies.adaptiveBuffer) {
                this.applyBufferOptimization(video, networkScore);
            }

            // 应用预加载优化
            if (this.optimizationStrategies.smartPreload) {
                this.applyPreloadOptimization(video, networkScore);
            }

            // 应用硬件加速优化
            if (this.optimizationStrategies.hardwareAcceleration) {
                this.applyHardwareAcceleration(video, deviceScore);
            }

            // 应用网络自适应优化
            if (this.optimizationStrategies.networkAdaptive) {
                this.applyNetworkAdaptiveOptimization(video, networkScore);
            }

            // 记录优化操作
            this.recordOptimization(videoId, {
                buffer: this.optimizationStrategies.adaptiveBuffer,
                preload: this.optimizationStrategies.smartPreload,
                hardware: this.optimizationStrategies.hardwareAcceleration,
                networkAdaptive: this.optimizationStrategies.networkAdaptive,
                networkScore,
                deviceScore,
                timestamp: Date.now()
            });
        }

        // 新增：应用缓冲优化
        applyBufferOptimization(video, networkScore) {
            let bufferSize = this.controller.config.optimization.bufferSize || 30;

            // 基于网络评分调整缓冲大小
            bufferSize = bufferSize * this.bufferConfig.networkFactor * this.bufferConfig.deviceFactor;

            // 限制缓冲大小范围
            bufferSize = Math.max(this.bufferConfig.minBufferSize,
                Math.min(bufferSize, this.bufferConfig.maxBufferSize));

            // 设置缓冲大小（通过属性标记，实际缓冲控制需要更复杂的实现）
            video.dataset.optimizedBuffer = bufferSize;
            video.dataset.bufferOptimized = 'true';

            console.log(`缓冲优化: 网络评分=${networkScore}, 缓冲大小=${bufferSize.toFixed(1)}s`);
        }

        // 新增：应用预加载优化
        applyPreloadOptimization(video, networkScore) {
            let preloadValue = 'metadata';

            if (networkScore > 70) {
                preloadValue = 'auto';
            } else if (networkScore > 40) {
                preloadValue = 'metadata';
            } else {
                preloadValue = 'none';
            }

            try {
                video.preload = preloadValue;
                video.dataset.preloadOptimized = 'true';
                console.log(`预加载优化: 网络评分=${networkScore}, preload=${preloadValue}`);
            } catch (error) {
                console.warn('预加载设置失败:', error);
            }
        }

        // 新增：应用硬件加速
        applyHardwareAcceleration(video, deviceScore) {
            try {
                if (deviceScore > 60) {
                    video.setAttribute('playsinline', '');
                    video.style.willChange = 'transform';
                    video.dataset.hardwareAccelerated = 'true';
                } else {
                    video.removeAttribute('playsinline');
                    video.style.willChange = 'auto';
                    video.dataset.hardwareAccelerated = 'false';
                }
                console.log(`硬件加速优化: 设备评分=${deviceScore}, 启用=${deviceScore > 60}`);
            } catch (error) {
                console.warn('硬件加速设置失败:', error);
            }
        }

        // 新增：应用网络自适应优化
        applyNetworkAdaptiveOptimization(video, networkScore) {
            // 网络差时降低默认播放质量
            if (networkScore < 30 && video.currentTime === 0) {
                // 标记为需要质量优化
                video.dataset.qualityOptimization = 'pending';
                console.log(`网络自适应优化: 网络评分低(${networkScore}), 已标记质量优化`);
            }
        }

        // 新增：设置视频事件监听
        setupVideoEventListeners(video) {
            const videoId = this._getVideoUniqueId(video);

            if (this.videoEventListeners.has(videoId)) {
                return; // 已经设置过监听器
            }

            const listeners = {
                waiting: this.handleBufferingStart.bind(this, video),
                canplay: this.handleBufferingEnd.bind(this, video),
                stalled: this.handleStalled.bind(this, video),
                progress: this.handleProgress.bind(this, video),
                timeupdate: this.handleTimeUpdate.bind(this, video),
                loadedmetadata: this.handleMetadataLoaded.bind(this, video),
                error: this.handleVideoError.bind(this, video)
            };

            // 注册事件监听器
            Object.entries(listeners).forEach(([event, handler]) => {
                video.addEventListener(event, handler);
            });

            this.videoEventListeners.set(videoId, listeners);
            console.log(`设置视频事件监听器: ${videoId}`);
        }

        // 新增：移除视频事件监听
        removeVideoEventListeners(video) {
            const videoId = this._getVideoUniqueId(video);
            const listeners = this.videoEventListeners.get(videoId);

            if (listeners) {
                Object.entries(listeners).forEach(([event, handler]) => {
                    video.removeEventListener(event, handler);
                });
                this.videoEventListeners.delete(videoId);
                console.log(`移除视频事件监听器: ${videoId}`);
            }
        }

        // 新增：处理缓冲开始
        handleBufferingStart(video) {
            const videoId = this._getVideoUniqueId(video);
            this.qualityMetrics.bufferingEvents++;

            console.log(`视频缓冲开始: ${videoId}`);

            // 记录性能事件
            if (this.performanceMonitor) {
                this.performanceMonitor.recordVideoEvent(video, 'buffering_start');
            }

            // 触发缓冲优化
            this.triggerBufferingOptimization(video);
        }

        // 新增：处理缓冲结束
        handleBufferingEnd(video) {
            const videoId = this._getVideoUniqueId(video);
            console.log(`视频缓冲结束: ${videoId}`);

            if (this.performanceMonitor) {
                this.performanceMonitor.recordVideoEvent(video, 'buffering_end');
            }
        }

        // 新增：处理卡顿
        handleStalled(video) {
            const videoId = this._getVideoUniqueId(video);
            this.qualityMetrics.stallEvents++;

            console.warn(`视频卡顿: ${videoId}`);

            if (this.performanceMonitor) {
                this.performanceMonitor.recordVideoEvent(video, 'stalled');
            }

            // 触发紧急优化
            this.triggerEmergencyOptimization(video);
        }

        // 新增：处理进度更新
        handleProgress(video) {
            const videoId = this._getVideoUniqueId(video);
            const buffered = video.buffered;

            if (buffered.length > 0) {
                const bufferedEnd = buffered.end(buffered.length - 1);
                const bufferedTime = bufferedEnd - video.currentTime;

                // 更新缓冲统计
                this.updateBufferStatistics(videoId, bufferedTime);
            }
        }

        // 新增：处理时间更新
        handleTimeUpdate(video) {
            const videoId = this._getVideoUniqueId(video);

            // 更新播放统计
            this.updatePlaybackStatistics(videoId, video.currentTime, video.duration);
        }

        // 新增：处理元数据加载
        handleMetadataLoaded(video) {
            const videoId = this._getVideoUniqueId(video);
            console.log(`视频元数据加载: ${videoId}, 时长: ${video.duration}s`);

            // 应用基于视频时长的优化
            this.applyDurationBasedOptimization(video);
        }

        // 新增：处理视频错误
        handleVideoError(video, error) {
            const videoId = this._getVideoUniqueId(video);
            console.error(`视频错误: ${videoId}`, error);

            if (this.performanceMonitor) {
                this.performanceMonitor.recordVideoEvent(video, 'error');
            }
        }

        // 新增：触发缓冲优化
        triggerBufferingOptimization(video) {
            if (!this.optimizationStrategies.adaptiveBuffer) return;

            const videoId = this._getVideoUniqueId(video);
            const currentBufferSize = parseFloat(video.dataset.optimizedBuffer) || 30;

            // 增加缓冲大小
            const newBufferSize = Math.min(currentBufferSize * 1.2, this.bufferConfig.maxBufferSize);
            video.dataset.optimizedBuffer = newBufferSize;

            console.log(`缓冲优化调整: ${videoId}, 缓冲大小 ${currentBufferSize} -> ${newBufferSize}s`);
        }

        // 新增：触发紧急优化
        triggerEmergencyOptimization(video) {
            const videoId = this._getVideoUniqueId(video);

            console.log(`执行紧急优化: ${videoId}`);

            // 降低视频质量（如果支持）
            this.reduceVideoQuality(video);

            // 进一步增加缓冲
            this.triggerBufferingOptimization(video);

            // 禁用硬件加速（如果启用）
            if (video.dataset.hardwareAccelerated === 'true') {
                this.applyHardwareAcceleration(video, 0); // 强制禁用
            }
        }

        // 新增：降低视频质量
        reduceVideoQuality(video) {
            // 尝试切换到低质量源（如果存在）
            const sources = video.querySelectorAll('source');
            const currentSrc = video.src || video.currentSrc;

            for (const source of sources) {
                if (source.src !== currentSrc &&
                    (source.src.includes('360') || source.src.includes('480'))) {
                    video.src = source.src;
                    console.log(`质量降低: 切换到低质量源`);
                    this.qualityMetrics.qualityChanges++;
                    break;
                }
            }
        }

        // 新增：更新缓冲统计
        updateBufferStatistics(videoId, bufferedTime) {
            if (!this.videoPerformance.has(videoId)) {
                this.videoPerformance.set(videoId, {
                    bufferStats: [],
                    playbackStats: [],
                    events: [],
                    optimizations: []
                });
            }

            const videoData = this.videoPerformance.get(videoId);
            videoData.bufferStats.push({
                bufferedTime,
                timestamp: Date.now()
            });

            // 限制数据量
            if (videoData.bufferStats.length > 100) {
                videoData.bufferStats = videoData.bufferStats.slice(-50);
            }
        }

        // 新增：更新播放统计
        updatePlaybackStatistics(videoId, currentTime, duration) {
            if (!this.videoPerformance.has(videoId)) {
                return;
            }

            const videoData = this.videoPerformance.get(videoId);
            videoData.playbackStats.push({
                currentTime,
                duration,
                progress: duration > 0 ? currentTime / duration : 0,
                timestamp: Date.now()
            });

            // 限制数据量
            if (videoData.playbackStats.length > 200) {
                videoData.playbackStats = videoData.playbackStats.slice(-100);
            }
        }

        // 新增：应用基于时长的优化
        applyDurationBasedOptimization(video) {
            const duration = video.duration;

            if (duration > 3600) { // 长视频（>1小时）
                // 长视频使用更保守的缓冲策略
                this.bufferConfig.minBufferSize = 10;
                this.bufferConfig.maxBufferSize = 120;
            } else if (duration < 300) { // 短视频（<5分钟）
                // 短视频可以使用更激进的预加载
                this.bufferConfig.minBufferSize = 2;
                this.bufferConfig.maxBufferSize = 30;
            }

            console.log(`时长优化: 视频时长=${duration}s, 缓冲范围=${this.bufferConfig.minBufferSize}-${this.bufferConfig.maxBufferSize}s`);
        }

        // 新增：记录优化操作
        recordOptimization(videoId, optimization) {
            if (!this.videoPerformance.has(videoId)) {
                this.videoPerformance.set(videoId, {
                    bufferStats: [],
                    playbackStats: [],
                    events: [],
                    optimizations: []
                });
            }

            const videoData = this.videoPerformance.get(videoId);
            videoData.optimizations.push(optimization);

            console.log(`记录优化操作: ${videoId}`, optimization);
        }

        // 增强视频事件处理
        _handleVideoEvent(e) {
            const video = e.target;
            const eventType = e.type;
            const videoId = this._getVideoUniqueId(video);

            // 记录视频事件
            this.recordVideoEvent(videoId, eventType, video);

            if (this._isPlaybackRateEvent(eventType)) {
                this._handlePlaybackRateChange(video);
            }

            if (['play', 'playing'].includes(eventType)) {
                this._handlePlayStateChange(video, true);
            } else if (['pause', 'ended', 'waiting'].includes(eventType)) {
                this._handlePlayStateChange(video, false);
            }

            if (eventType === 'volumechange') {
                this.controller.managers.audioState.handleVolumeChange(video);
            }

            if (eventType === 'timeupdate' && !video.paused) {
                this._handleTimeUpdate(video);
            }

            if ((eventType === 'loadeddata' || eventType === 'canplay') && !video._playbackRestored) {
                setTimeout(() => this.controller.managers.restoration.restorePlaybackPositionWithRetry(video), 100);
            }

            if (['play', 'pause', 'ended', 'timeupdate', 'loadeddata'].includes(eventType)) {
                this.controller.managers.loop.syncLoopStateFromVideo(video);
            }

            // 新增：性能监控
            if (this.performanceMonitor && ['timeupdate', 'waiting', 'canplay'].includes(eventType)) {
                this.performanceMonitor.recordVideoEvent(video, eventType);
            }

            this.controller.ui.ensureControlsVisible();
            this.controller.ui.updateProgressCircle();
        }

        // 新增：记录视频事件
        recordVideoEvent(videoId, eventType, video) {
            if (!this.videoPerformance.has(videoId)) {
                this.videoPerformance.set(videoId, {
                    events: [],
                    optimizations: [],
                    bufferStats: [],
                    playbackStats: []
                });
            }

            const videoData = this.videoPerformance.get(videoId);
            videoData.events.push({
                type: eventType,
                timestamp: Date.now(),
                currentTime: video.currentTime,
                readyState: video.readyState,
                networkState: video.networkState,
                buffered: this.getBufferedInfo(video)
            });

            // 限制事件记录数量
            if (videoData.events.length > 100) {
                videoData.events = videoData.events.slice(-50);
            }
        }

        // 新增：获取缓冲信息
        getBufferedInfo(video) {
            const buffered = video.buffered;
            const info = {
                ranges: [],
                totalBuffered: 0
            };

            for (let i = 0; i < buffered.length; i++) {
                const range = {
                    start: buffered.start(i),
                    end: buffered.end(i)
                };
                info.ranges.push(range);
                info.totalBuffered += range.end - range.start;
            }

            return info;
        }

        // 增强目标视频获取
        getTargetVideo() {
            const videos = Array.from(document.querySelectorAll('video'))
                .filter(video => {
                    const isVisible = this._getElementVisibility(video) > 0.05;
                    const isAudioModeVideo = this.controller.managers.audio.isInAudioMode(video);
                    const isValid = video.readyState > 0;
                    const isInDOM = document.contains(video);

                    return (isVisible || isAudioModeVideo) && isValid && isInDOM;
                });

            if (videos.length === 0) return null;
            if (videos.length === 1) return videos[0];

            // 新增：基于性能的智能评分
            const videoScores = videos.map(video => ({
                video,
                score: this._calculateEnhancedVideoActiveScore(video),
                performanceScore: this.calculatePerformanceScore(video)
            }));

            // 综合评分排序
            videoScores.sort((a, b) => {
                const totalA = a.score + a.performanceScore;
                const totalB = b.score + b.performanceScore;
                return totalB - totalA;
            });

            return videoScores[0].video;
        }

        // 新增：计算性能评分
        calculatePerformanceScore(video) {
            let score = 0;

            // 基于播放状态
            if (!video.paused) score += 30;

            // 基于缓冲状况
            const buffered = video.buffered;
            if (buffered.length > 0) {
                const bufferedTime = buffered.end(buffered.length - 1) - video.currentTime;
                if (bufferedTime > 10) score += 25;
                else if (bufferedTime > 5) score += 15;
                else if (bufferedTime > 2) score += 5;
            }

            // 基于视频质量
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (width && height) {
                const pixels = width * height;
                if (pixels > 1920 * 1080) score += 20;
                else if (pixels > 1280 * 720) score += 15;
                else score += 10;
            }

            // 基于网络状态
            if (this.performanceAnalyzer) {
                const networkScore = this.performanceAnalyzer.getNetworkQualityScore();
                score += (networkScore / 100) * 25;
            }

            return score;
        }

        // 增强播放控制
        togglePlayPauseReliable(video) {
            if (video.readyState < 2) {
                video.load();
            }

            const isLiveStream = !isFinite(video.duration) || video.duration === Infinity;

            if (video.paused) {
                const playPromise = video.play();

                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        this.controller.setState({ isPlaying: true });
                        this.controller.ui.updatePlayPauseBtnText();

                        // 新增：记录播放开始
                        this.recordPlaybackStart(video);
                    }).catch(error => {
                        console.log('播放失败:', error);
                        this._retryPlay(video);
                    });
                }
            } else {
                if (isLiveStream) {
                    video._originalPlaybackRate = video.playbackRate;
                    video.playbackRate = 0;
                    this.controller.setState({ isPlaying: false });
                    this.controller.ui.updatePlayPauseBtnText();
                    console.log('直播流已暂停（播放速度设为0）');
                } else {
                    video.pause();
                    this.controller.setState({ isPlaying: false });
                    this.controller.ui.updatePlayPauseBtnText();
                }

                // 新增：记录播放暂停
                this.recordPlaybackPause(video);
            }
        }

        // 新增：记录播放开始
        recordPlaybackStart(video) {
            const videoId = this._getVideoUniqueId(video);
            if (this.performanceMonitor) {
                this.performanceMonitor.recordVideoEvent(video, 'playback_start');
            }

            // 记录播放统计
            this.recordPlaybackStatistics(videoId, 'play_start');
        }

        // 新增：记录播放暂停
        recordPlaybackPause(video) {
            const videoId = this._getVideoUniqueId(video);
            if (this.performanceMonitor) {
                this.performanceMonitor.recordVideoEvent(video, 'playback_pause');
            }

            // 记录播放统计
            this.recordPlaybackStatistics(videoId, 'play_pause');
        }

        // 新增：记录播放统计
        recordPlaybackStatistics(videoId, action) {
            if (!this.videoPerformance.has(videoId)) {
                return;
            }

            const videoData = this.videoPerformance.get(videoId);
            videoData.lastAction = {
                action,
                timestamp: Date.now()
            };
        }

        // 新增：保存视频状态
        saveVideoState(video) {
            const videoId = this._getVideoUniqueId(video);
            const state = {
                currentTime: video.currentTime,
                playbackRate: video.playbackRate,
                volume: video.volume,
                muted: video.muted,
                timestamp: Date.now()
            };

            if (!this.videoStates.has(videoId)) {
                this.videoStates.set(videoId, []);
            }

            const states = this.videoStates.get(videoId);
            states.push(state);

            // 限制状态记录数量
            if (states.length > 50) {
                this.videoStates.set(videoId, states.slice(-25));
            }
        }

        // 新增：获取视频标识
        getVideoIdentifier(video) {
            if (!video) return 'null';
            const src = video.src || video.currentSrc || '';
            return src ? src.substring(0, 50) + '...' : 'unknown';
        }

        // 新增：获取视频性能数据
        getVideoPerformance(videoId) {
            return this.videoPerformance.get(videoId);
        }

        // 新增：获取所有视频性能数据
        getAllVideoPerformance() {
            return Array.from(this.videoPerformance.entries()).map(([id, data]) => ({
                id,
                ...data,
                summary: this.generatePerformanceSummary(data)
            }));
        }

        // 新增：生成性能摘要
        generatePerformanceSummary(videoData) {
            const bufferStats = videoData.bufferStats || [];
            const playbackStats = videoData.playbackStats || [];
            const events = videoData.events || [];

            const bufferingEvents = events.filter(e => e.type === 'waiting').length;
            const stallEvents = events.filter(e => e.type === 'stalled').length;

            const avgBufferedTime = bufferStats.length > 0 ?
                bufferStats.reduce((sum, stat) => sum + stat.bufferedTime, 0) / bufferStats.length : 0;

            return {
                bufferingEvents,
                stallEvents,
                averageBufferedTime: avgBufferedTime.toFixed(2),
                totalEvents: events.length,
                optimizationCount: (videoData.optimizations || []).length
            };
        }

        // 新增：适应网络变化
        adaptToNetworkChange() {
            console.log('适应网络变化，重新优化所有视频');

            // 重新应用优化策略
            this.applyInitialOptimizations();

            // 重新优化所有活跃视频
            const videos = Array.from(document.querySelectorAll('video'));
            videos.forEach(video => {
                if (this.controller.managers.audio.isInAudioMode(video) ||
                    this._getElementVisibility(video) > 0.1) {
                    this.optimizeVideoPlayback(video);
                }
            });
        }

        // 新增：处理内存压力
        handleMemoryPressure() {
            console.warn('检测到内存压力，执行内存优化');

            // 清理旧的性能数据
            this.cleanupOldPerformanceData();

            // 减少缓冲大小
            this.bufferConfig.minBufferSize = Math.max(2, this.bufferConfig.minBufferSize * 0.7);
            this.bufferConfig.maxBufferSize = Math.max(10, this.bufferConfig.maxBufferSize * 0.7);

            // 禁用硬件加速
            this.optimizationStrategies.hardwareAcceleration = false;

            console.log('内存优化完成', this.bufferConfig);
        }

        // 新增：清理旧的性能数据
        cleanupOldPerformanceData() {
            const now = Date.now();
            const maxAge = 30 * 60 * 1000; // 30分钟

            for (const [videoId, videoData] of this.videoPerformance) {
                // 清理旧事件
                if (videoData.events) {
                    videoData.events = videoData.events.filter(event =>
                        now - event.timestamp < maxAge
                    );
                }

                // 清理旧统计
                if (videoData.bufferStats) {
                    videoData.bufferStats = videoData.bufferStats.filter(stat =>
                        now - stat.timestamp < maxAge
                    );
                }

                if (videoData.playbackStats) {
                    videoData.playbackStats = videoData.playbackStats.filter(stat =>
                        now - stat.timestamp < maxAge
                    );
                }
            }
        }

        // 新增：获取质量指标
        getQualityMetrics() {
            return { ...this.qualityMetrics };
        }

        // 原有方法保持不变
        _restoreAllVideosPlaybackPosition() {
            this.controller.managers.restoration.attemptRestoreAllVideos();
        }

        setupPersistentObserver() {
            this.observer = new MutationObserver((mutations) => {
                let shouldCheck = false;

                for (const mutation of mutations) {
                    for (const node of mutation.removedNodes) {
                        if (this._isVideoRelated(node)) {
                            shouldCheck = true;
                            this._handleVideoRemoved(node);
                            break;
                        }
                    }

                    for (const node of mutation.addedNodes) {
                        if (this._isVideoRelated(node)) {
                            shouldCheck = true;
                            break;
                        }
                    }

                    if (shouldCheck) break;
                }

                if (shouldCheck) {
                    setTimeout(() => this.updateControlsState(), 100);
                }
            });

            this.observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        }

        _isVideoRelated(node) {
            return node.nodeName === 'VIDEO' ||
                (node.querySelector && node.querySelector('video'));
        }

        _handleVideoRemoved(node) {
            const currentAudioVideo = this.controller.managers.audio.getCurrentAudioVideo();

            if (this.controller.state.isAudioMode && node === currentAudioVideo) {
                console.log('音频模式视频被移除，退出音频模式');
                this.controller.managers.audio.exitAudioMode();
            }

            // 新增：移除事件监听器
            if (node.nodeName === 'VIDEO') {
                this.removeVideoEventListeners(node);
            } else if (node.querySelector) {
                const videos = node.querySelectorAll('video');
                videos.forEach(video => this.removeVideoEventListeners(video));
            }
        }

        setupStableInterval() {
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
            }

            this.checkInterval = setInterval(() => {
                this.updateControlsState();

                if (this.controller.state.isAudioMode) {
                    this.controller.managers.audio.checkConsistency();
                }

                if (this.controller.state.currentVideo) {
                    this.controller.managers.loop.syncLoopStateFromVideo(this.controller.state.currentVideo);
                }

                // 新增：定期性能检查
                this.periodicPerformanceCheck();

            }, this.controller.config.detection.checkInterval);
        }

        // 新增：定期性能检查
        periodicPerformanceCheck() {
            // 每10次检查执行一次性能分析
            if (!this._performanceCheckCount) {
                this._performanceCheckCount = 0;
            }

            this._performanceCheckCount++;
            if (this._performanceCheckCount >= 10) {
                this._performanceCheckCount = 0;
                this.analyzeVideoPerformance();
            }
        }

        // 新增：分析视频性能
        analyzeVideoPerformance() {
            const videos = Array.from(document.querySelectorAll('video'));
            let totalBuffering = 0;
            let totalStalls = 0;

            videos.forEach(video => {
                const videoId = this._getVideoUniqueId(video);
                const performanceData = this.videoPerformance.get(videoId);

                if (performanceData) {
                    totalBuffering += performanceData.events.filter(e => e.type === 'waiting').length;
                    totalStalls += performanceData.events.filter(e => e.type === 'stalled').length;
                }
            });

            console.log(`视频性能分析: 缓冲事件=${totalBuffering}, 卡顿事件=${totalStalls}, 监控视频数=${videos.length}`);
        }

        setupComprehensiveEventListeners() {
            const passiveOptions = { passive: true };

            const videoEvents = [
                'play', 'pause', 'ended', 'loadeddata', 'canplay',
                'waiting', 'playing', 'timeupdate', 'progress',
                'volumechange', 'loadedmetadata', 'canplaythrough', 'ratechange'
            ];

            videoEvents.forEach(eventType => {
                document.addEventListener(eventType, (e) => {
                    if (e.target.tagName === 'VIDEO') {
                        requestAnimationFrame(() => {
                            this._handleVideoEvent(e);
                        });
                    }
                }, true);
            });

            document.addEventListener('loadeddata', (e) => {
                if (e.target.tagName === 'VIDEO' && !e.target._playbackRestored) {
                    setTimeout(() => {
                        this.controller.managers.restoration.restorePlaybackPositionWithRetry(e.target);
                    }, 100);
                }
            }, true);

            document.addEventListener('canplay', (e) => {
                if (e.target.tagName === 'VIDEO' && !e.target._playbackRestored) {
                    setTimeout(() => {
                        this.controller.managers.restoration.restorePlaybackPositionWithRetry(e.target);
                    }, 100);
                }
            }, true);

            let scrollTimeout;
            const handleScroll = () => {
                if (scrollTimeout) {
                    cancelAnimationFrame(scrollTimeout);
                }
                scrollTimeout = requestAnimationFrame(() => {
                    this._handleScrollOrResize();
                });
            };

            document.addEventListener('scroll', handleScroll, passiveOptions);
            window.addEventListener('resize', handleScroll, passiveOptions);
        }

        setupVideoInteractionTracking() {
            document.addEventListener('click', (e) => {
                const video = e.target.closest('video');
                if (video) {
                    this._handleVideoInteraction(video);
                }
            }, true);

            document.addEventListener('touchstart', (e) => {
                const video = e.target.closest('video');
                if (video) {
                    this._handleVideoInteraction(video);
                }
            }, true);
        }

        _handleVideoInteraction(video) {
            video._lastInteractionTime = Date.now();
            video._userInteracted = true;

            if (video !== this.controller.state.currentVideo) {
                this.controller.managers.batch.debouncedVideoSwitch(video);
            }
        }

        _handleScrollOrResize() {
            const newTargetVideo = this.getTargetVideo();
            if (newTargetVideo && newTargetVideo !== this.controller.state.currentVideo) {
                this.controller.managers.batch.debouncedVideoSwitch(newTargetVideo);
            }
        }

        _isPlaybackRateEvent(eventType) {
            return ['play', 'loadeddata', 'canplay', 'playing', 'loadedmetadata', 'canplaythrough', 'ratechange'].includes(eventType);
        }

        _handlePlaybackRateChange(video) {
            if (video.playbackRate !== this.controller.state.playbackRate) {
                this.controller.setState({ playbackRate: video.playbackRate });
                this.controller.ui.setMainBtnTxt();
            } else {
                video.playbackRate = this.controller.state.playbackRate;
            }
        }

        _handlePlayStateChange(video, isPlaying) {
            if (this._isForcedPlaybackSite() && video._forcedPlaybackSite) {
                if (isPlaying && !video._userInteracted) {
                    video._hasPlayedOnce = false;
                } else if (isPlaying && video._userInteracted) {
                    video._hasPlayedOnce = true;
                }
            } else {
                video._hasPlayedOnce = isPlaying;
            }

            this.controller.setState({ isPlaying });
            this.controller.ui.updatePlayPauseBtnText();
        }

        _handleTimeUpdate(video) {
            if (video._forcedPlaybackSite && !video._userInteracted) {
                return;
            }

            if (!video._lastSaveTime || Date.now() - video._lastSaveTime > 3000) {
                this.controller.managers.storage.savePlaybackRecord(video);
                video._lastSaveTime = Date.now();
            }
        }

        _getVideoUniqueId(video) {
            const pageIdentifier = this._getStablePageIdentifier();
            const videoFeatures = this._extractEnhancedVideoFeatures(video);
            const contextIdentifier = this._getContextIdentifier(video);

            const combinedString = pageIdentifier + '_' + videoFeatures + '_' + contextIdentifier;
            return `video_${this._hashString(combinedString)}`;
        }

        _extractEnhancedVideoFeatures(video) {
            const features = [];

            const src = video.src || video.currentSrc || '';
            if (src) {
                try {
                    const url = new URL(src);

                    if (this.controller._isBilibiliSite()) {
                        const pathParts = url.pathname.split('/').filter(part => part);
                        const lastPart = pathParts[pathParts.length - 1];

                        if (lastPart && (lastPart.includes('BV') || lastPart.includes('av') || lastPart.match(/^\d+$/))) {
                            features.push(`bili_${lastPart}`);
                        } else {
                            features.push(`bili_path_${url.pathname.replace(/\//g, '_')}`);
                        }

                        const importantParams = ['p', 'page', 't'];
                        const params = new URLSearchParams(url.search);
                        importantParams.forEach(param => {
                            if (params.has(param)) {
                                features.push(`param_${param}_${params.get(param)}`);
                            }
                        });
                    } else {
                        features.push(`${url.hostname}_${url.pathname.split('/').pop()}`);
                    }
                } catch (e) {
                    features.push(src.substring(0, 100));
                }
            } else {
                features.push('no_src');
                features.push(`width_${video.videoWidth}`);
                features.push(`height_${video.videoHeight}`);
            }

            const container = this._findVideoContainer(video);
            if (container) {
                const containerId = this._getContainerIdentifier(container);
                if (containerId) {
                    features.push(`container_${containerId}`);
                }
            }

            const rect = video.getBoundingClientRect();
            features.push(`size_${Math.round(rect.width)}x${Math.round(rect.height)}`);

            return features.join('_');
        }

        _getStablePageIdentifier() {
            const pathname = window.location.pathname;
            const title = document.title.split(' - ')[0];

            let routeInfo = '';
            if (window.history.state && window.history.state.key) {
                routeInfo = window.history.state.key;
            }

            if (this.controller._isBilibiliSite()) {
                const bvidMatch = window.location.pathname.match(/\/video\/(BV\w+)/);
                if (bvidMatch) {
                    return `bilibili_${bvidMatch[1]}`;
                }

                const avMatch = window.location.pathname.match(/\/video\/(av\d+)/);
                if (avMatch) {
                    return `bilibili_${avMatch[1]}`;
                }
            }

            return `${pathname}_${title}_${routeInfo}`;
        }

        _getContextIdentifier(video) {
            const context = [];

            const videoCount = document.querySelectorAll('video').length;
            context.push(`count_${videoCount}`);

            const rect = video.getBoundingClientRect();
            const viewportCenter = {
                x: window.innerWidth / 2,
                y: window.innerHeight / 2
            };
            const videoCenter = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2
            };
            const distance = Math.sqrt(
                Math.pow(videoCenter.x - viewportCenter.x, 2) +
                Math.pow(videoCenter.y - viewportCenter.y, 2)
            );
            context.push(`dist_${Math.round(distance)}`);

            return context.join('_');
        }

        _hashString(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash).toString(36);
        }

        _findVideoContainer(video) {
            const containerSelectors = [
                'article', '.WB_feed', '.wbpro-feed-video',
                '[class*="card"]', '[class*="item"]', '[class*="feed"]',
                '.VideoCard', '.weibo-video', '.video-container',
                '.WB_media_wrap', '.mwb-video', '.mplayer',
                '.bpx-player-container', '.bilibili-player'
            ];

            for (const selector of containerSelectors) {
                const container = video.closest(selector);
                if (container) return container;
            }

            let element = video.parentElement;
            for (let i = 0; i < 5; i++) {
                if (element && element !== document.body) {
                    if (element.id || element.getAttribute('data-id') ||
                        element.getAttribute('mid') || element.getAttribute('oid')) {
                        return element;
                    }
                    element = element.parentElement;
                } else {
                    break;
                }
            }

            return null;
        }

        _getContainerIdentifier(container) {
            const dataId = container.getAttribute('data-id') ||
                container.getAttribute('mid') ||
                container.getAttribute('oid') ||
                container.getAttribute('id');
            if (dataId) return dataId;

            const textContent = container.textContent || '';
            if (textContent.length > 20) {
                return `content_${this._hashString(textContent.substring(0, 100))}`;
            }

            return null;
        }

        _calculateEnhancedVideoActiveScore(video) {
            let score = 0;

            if (!video.paused) score += 100;

            if (this.controller.managers.audio.isInAudioMode(video)) {
                score += 200;
            }

            const visibility = this._getElementVisibility(video);
            score += visibility * 50;

            if (video._lastInteractionTime) {
                const timeSinceInteraction = Date.now() - video._lastInteractionTime;
                if (timeSinceInteraction < 10000) {
                    score += 30 * (1 - timeSinceInteraction / 10000);
                }
            }

            const rect = video.getBoundingClientRect();
            const viewportCenter = window.innerHeight / 2;
            const videoCenter = rect.top + rect.height / 2;
            const distanceFromCenter = Math.abs(videoCenter - viewportCenter);
            const centerRatio = 1 - Math.min(distanceFromCenter / window.innerHeight, 1);
            score += centerRatio * 40;

            if (video.duration > 0) {
                const progress = video.currentTime / video.duration;
                if (progress > 0.1 && progress < 0.9) score += 20;
            }

            if (video === this.controller.state.currentVideo) score += 25;

            if (this.controller._isTwitterSite()) {
                const twitterContainer = video.closest('[data-testid="videoPlayer"]');
                if (twitterContainer) {
                    score += 50;
                }
            }

            return score;
        }

        _getElementVisibility(element) {
            const rect = element.getBoundingClientRect();
            const windowHeight = window.innerHeight || document.documentElement.clientHeight;
            const windowWidth = window.innerWidth || document.documentElement.clientWidth;

            if (rect.bottom < 0 || rect.top > windowHeight ||
                rect.right < 0 || rect.left > windowWidth) {
                return 0;
            }

            const visibleTop = Math.max(0, rect.top);
            const visibleBottom = Math.min(windowHeight, rect.bottom);
            const visibleLeft = Math.max(0, rect.left);
            const visibleRight = Math.min(windowWidth, rect.right);

            const visibleHeight = visibleBottom - visibleTop;
            const visibleWidth = visibleRight - visibleLeft;
            const visibleArea = visibleHeight * visibleWidth;
            const totalArea = rect.height * rect.width;

            if (totalArea === 0) return 0;

            let visibilityRatio = visibleArea / totalArea;

            const style = window.getComputedStyle(element);
            const opacity = parseFloat(style.opacity);
            const zIndex = parseInt(style.zIndex) || 0;

            visibilityRatio *= opacity;
            visibilityRatio *= (1 + zIndex / 1000);

            return visibilityRatio;
        }

        updateControlsState() {
            const videos = Array.from(document.querySelectorAll('video')).filter(v => {
                const isVisible = this._getElementVisibility(v) > 0.1;
                const isAudioModeVideo = this.controller.managers.audio.isInAudioMode(v);
                const isValid = v.readyState > 0;
                const isInDOM = document.contains(v);

                return (isVisible || isAudioModeVideo) && isValid && isInDOM;
            });

            const hasVideo = videos.length > 0;
            const isTwitter = this.controller._isTwitterSite();
            const isAudioMode = this.controller.state.isAudioMode;

            const shouldShowControls = hasVideo || isAudioMode ||
                (isTwitter && videos.length > 0);

            if (shouldShowControls) {
                if (!this.controller.ui.controlsContainer) {
                    this.controller.ui.createControls();
                }

                if (this.controller.ui.controlsContainer) {
                    this.controller.ui.controlsContainer.style.display = 'flex';
                }

                const targetVideo = this.getTargetVideo();

                if (targetVideo && targetVideo !== this.controller.state.currentVideo) {
                    this.controller.managers.batch.debouncedVideoSwitch(targetVideo);
                } else if (!this.controller.state.currentVideo && targetVideo) {
                    this.controller.managers.batch.debouncedVideoSwitch(targetVideo);
                }

                if (this.controller.state.currentVideo) {
                    this.controller.ui.syncVideoStateToBtn();
                    this.controller.ui.updateControlsForVideo(this.controller.state.currentVideo);
                }
            } else {
                if (this.controller.ui.controlsContainer) {
                    this.controller.ui.controlsContainer.style.display = 'none';
                }
                this.controller.setState({
                    currentVideo: null,
                    previousVideo: null
                });
            }
        }

        syncAllVideosSpeed() {
            const videos = Array.from(document.querySelectorAll("video"));
            this.controller.managers.batch.batchSetVideoProperty(
                videos,
                'playbackRate',
                this.controller.state.playbackRate,
                this.controller.config.performance.batchOperationDelay
            );

            videos.forEach(v => {
                if (v._originalPlaybackRate !== undefined && v.playbackRate === 0) {
                    v._originalPlaybackRate = this.controller.state.playbackRate;
                }
            });
        }

        setVideoSpeed(speed) {
            const newRate = Math.max(
                this.controller.config.playbackRate.min,
                Math.min(speed, this.controller.config.playbackRate.max)
            );

            this.controller.setState({ playbackRate: newRate });
            this.controller.ui.setMainBtnTxt();
            this.controller.ui.hideSpeedPanel();
        }

        _retryPlay(video) {
            try {
                video.currentTime = video.currentTime || 0;
                video.play().then(() => {
                    this.controller.setState({ isPlaying: true });
                    this.controller.ui.updatePlayPauseBtnText();
                }).catch(e => {
                    console.log('播放失败:', e);
                    this.controller.setState({ isPlaying: false });
                    this.controller.ui.updatePlayPauseBtnText();
                });
            } catch (e) {
                console.log('播放视频时发生错误:', e);
                this.controller.setState({ isPlaying: false });
                this.controller.ui.updatePlayPauseBtnText();
            }
        }

        saveCurrentState() {
            const targetVideo = this.getTargetVideo();
            if (targetVideo) {
                this.controller.managers.storage.savePlaybackRecord(targetVideo);
                this.controller.managers.storage.saveVideoAudioModeState(targetVideo);
            }
        }

        cleanup() {
            if (this.observer) {
                this.observer.disconnect();
            }
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
            }

            // 新增：清理所有事件监听器
            this.videoEventListeners.forEach((listeners, videoId) => {
                // 在实际清理时，我们需要video元素引用，这里只是清理记录
                console.log(`清理事件监听器记录: ${videoId}`);
            });
            this.videoEventListeners.clear();

            console.log('增强版视频管理器已清理');
        }

        _isForcedPlaybackSite() {
            return this.controller._isForcedPlaybackSite();
        }
    }
    // =========================================================================
    // 模块5: 音频/视频模式管理模块 (独立功能模块)
    // =========================================================================
    class FixedAudioModeManager {
        constructor(controller) {
            this.controller = controller;
            this.originalVideoStates = new Map();
            this.currentAudioVideo = null;
            this.audioModeActivated = 0;
            this.isTransitioning = false;
        }

        initialize() {
            this.cleanup();

            if (this.controller.config.enhanced.audioModeTemporary) {
                this.controller.setState({ isAudioMode: false });
            }
        }

        toggleAudioMode() {
            if (this.isTransitioning) {
                console.log('音频模式切换中，请稍候...');
                return;
            }

            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (!targetVideo) {
                console.log('未找到目标视频，无法切换音频模式');
                return;
            }

            this.isTransitioning = true;

            try {
                targetVideo._userInteracted = true;

                const newAudioMode = !this.controller.state.isAudioMode;
                console.log(`切换音频模式: ${newAudioMode ? '开启' : '关闭'}`);

                if (newAudioMode) {
                    this.applyAudioMode(targetVideo);
                    this.controller.setState({ isAudioMode: true });
                } else {
                    this.restoreVideoMode(targetVideo);
                    this.controller.setState({ isAudioMode: false });
                }

                this.controller.ui.updateAudioBtnState();
                this.controller.ui.hideSpeedPanel();

                setTimeout(() => {
                    this.controller.managers.video.updateControlsState();
                }, 100);

            } catch (error) {
                console.error('音频模式切换失败:', error);
            } finally {
                this.isTransitioning = false;
            }
        }

        applyAudioMode(video) {
            if (!video) return;

            const videoId = this.controller.managers.video._getVideoUniqueId(video);
            console.log(`应用音频模式到视频: ${videoId}`);

            if (!this.originalVideoStates.has(videoId)) {
                this._saveOriginalVideoState(video, videoId);
            }

            this._applySafeAudioModeStyles(video);

            video._audioModeApplied = true;
            video._audioModeTime = Date.now();
            this.currentAudioVideo = video;
            this.audioModeActivated = Date.now();

            console.log(`音频模式应用完成: ${videoId}`);
        }

        _saveOriginalVideoState(video, videoId) {
            const rect = video.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(video);

            const originalState = {
                opacity: video.style.opacity,
                visibility: video.style.visibility,
                pointerEvents: video.style.pointerEvents,
                position: video.style.position,
                zIndex: video.style.zIndex,
                clipPath: video.style.clipPath,
                transform: video.style.transform,
                width: video.style.width,
                height: video.style.height,
                display: video.style.display,
                minWidth: video.style.minWidth,
                minHeight: video.style.minHeight,
                maxWidth: video.style.maxWidth,
                maxHeight: video.style.maxHeight,
                objectFit: video.style.objectFit,
                originalRect: {
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    left: rect.left
                },
                computedDisplay: computedStyle.display,
                computedPosition: computedStyle.position,
                computedWidth: computedStyle.width,
                computedHeight: computedStyle.height,
                computedObjectFit: computedStyle.objectFit,
                timestamp: Date.now()
            };

            this.originalVideoStates.set(videoId, originalState);
            console.log(`保存视频原始状态: ${videoId}`, originalState);
        }

        _applySafeAudioModeStyles(video) {
            requestAnimationFrame(() => {
                video.style.opacity = '0.001';
                video.style.visibility = 'hidden';
                video.style.pointerEvents = 'none';

                video.style.position = 'relative';
                video.style.zIndex = '-9999';
                video.style.clipPath = 'inset(50%)';

                const rect = video.getBoundingClientRect();
                if (rect.width > 0 && !video.style.width) {
                    video.style.width = rect.width + 'px';
                }
                if (rect.height > 0 && !video.style.height) {
                    video.style.height = rect.height + 'px';
                }

                if (!video.style.objectFit) {
                    video.style.objectFit = 'contain';
                }

                console.log('应用音频模式样式完成');
            });
        }

        restoreVideoMode(video) {
            if (!video) return;

            const videoId = this.controller.managers.video._getVideoUniqueId(video);
            console.log(`恢复视频模式: ${videoId}`);

            const originalState = this.originalVideoStates.get(videoId);

            if (originalState) {
                this._restoreOriginalStyles(video, originalState);
            } else {
                this._safeResetVideoStyles(video);
            }

            video._audioModeApplied = false;
            delete video._audioModeTime;

            if (this.currentAudioVideo === video) {
                this.currentAudioVideo = null;
                this.audioModeActivated = 0;
            }

            console.log(`视频模式恢复完成: ${videoId}`);
        }

        _restoreOriginalStyles(video, originalState) {
            requestAnimationFrame(() => {
                const styleProperties = [
                    'opacity', 'visibility', 'pointerEvents', 'position',
                    'zIndex', 'clipPath', 'transform', 'width', 'height',
                    'display', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'objectFit'
                ];

                styleProperties.forEach(property => {
                    if (originalState[property] !== undefined) {
                        video.style[property] = originalState[property];
                    } else {
                        video.style[property] = '';
                    }
                });

                console.log('恢复原始样式完成', originalState);
            });
        }

        _safeResetVideoStyles(video) {
            requestAnimationFrame(() => {
                const resetStyles = [
                    'opacity', 'visibility', 'pointerEvents', 'position',
                    'zIndex', 'clipPath', 'transform', 'width', 'height',
                    'display', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'objectFit'
                ];

                resetStyles.forEach(style => {
                    video.style[style] = '';
                });

                console.log('安全重置视频样式完成');
            });
        }

        forceRestoreAllVideos() {
            console.log('强制解除所有音频模式');

            const audioVideos = Array.from(document.querySelectorAll('video')).filter(
                video => this.isInAudioMode(video)
            );

            audioVideos.forEach(video => {
                this.restoreVideoMode(video);
            });

            this.currentAudioVideo = null;
            this.audioModeActivated = 0;
            this.controller.setState({ isAudioMode: false });
            this.controller.ui.updateAudioBtnState();
        }

        exitAudioMode() {
            if (this.currentAudioVideo) {
                this.restoreVideoMode(this.currentAudioVideo);
            } else {
                this.forceRestoreAllVideos();
            }

            this.controller.setState({ isAudioMode: false });
            this.controller.ui.updateAudioBtnState();

            if (this.controller.state.currentVideo) {
                this.controller.managers.storage.saveVideoAudioModeState(this.controller.state.currentVideo);
            }

            console.log('已退出音频模式');
        }

        checkConsistency() {
            if (!this.controller.state.isAudioMode) return;

            if (this.isAudioModeExpired()) {
                console.log('音频模式已过期，自动退出');
                this.exitAudioMode();
                return;
            }

            const currentAudioVideo = this.getCurrentAudioVideo();
            if (!currentAudioVideo) {
                console.log('未找到音频模式视频，退出音频模式');
                this.exitAudioMode();
                return;
            }

            const checks = this._performAudioModeConsistencyChecks(currentAudioVideo);
            if (!checks.allPassed) {
                console.log('音频模式状态不一致，退出音频模式', checks);
                this.exitAudioMode();
                return;
            }

            this._checkPlaybackConsistencyEnhanced(currentAudioVideo);
        }

        _performAudioModeConsistencyChecks(video) {
            const checks = {
                isInDOM: document.contains(video),
                isValid: video.readyState > 0,
                hasAudioModeMark: video._audioModeApplied === true,
                isCurrentAudioVideo: video === this.currentAudioVideo,
                allPassed: true
            };

            checks.allPassed = checks.isInDOM && checks.isValid &&
                checks.hasAudioModeMark && checks.isCurrentAudioVideo;

            return checks;
        }

        _checkPlaybackConsistencyEnhanced(video) {
            if (!video) return;

            const actualPlaying = !video.paused;
            const expectedPlaying = this.controller.state.isPlaying;

            if (actualPlaying !== expectedPlaying) {
                console.log('播放状态不一致，同步状态', {
                    actual: actualPlaying,
                    expected: expectedPlaying
                });

                this.controller.setState({ isPlaying: actualPlaying });
                this.controller.ui.updatePlayPauseBtnText();
            }

            this.controller.ui.updateProgressCircle();
        }

        isAudioModeExpired() {
            if (!this.audioModeActivated) return false;
            const expiryTime = this.controller.config.storage.audioModeDuration;
            return Date.now() - this.audioModeActivated > expiryTime;
        }

        isInAudioMode(video) {
            return video &&
                video._audioModeApplied === true &&
                video === this.currentAudioVideo;
        }

        getCurrentAudioVideo() {
            return this.currentAudioVideo;
        }

        restoreVideoAudioModeState(video) {
            if (!video) return;

            if (this.controller.config.enhanced.audioModeTemporary) {
                this.controller.setState({ isAudioMode: false });
                this.restoreVideoMode(video);
                this.controller.ui.updateAudioBtnState();
            }
        }

        cleanup() {
            const now = Date.now();
            const expiryTime = this.controller.config.storage.playbackRecordExpiry;
            const expiredKeys = [];

            for (let [videoId, state] of this.originalVideoStates) {
                if (now - (state.timestamp || 0) > expiryTime) {
                    expiredKeys.push(videoId);
                }
            }

            expiredKeys.forEach(key => {
                this.originalVideoStates.delete(key);
            });

            if (expiredKeys.length > 0) {
                console.log(`清理了 ${expiredKeys.length} 个过期的音频模式状态`);
            }
        }
    }
    // =========================================================================
    // 模块6: 声音状态管理模块 (独立功能模块)
    // =========================================================================
    class EnhancedAudioStateManager {
        constructor(controller) {
            this.controller = controller;
            this.volumeBeforeMute = 1.0;
            this.isExternalMute = false;
            this.lastVolumeChangeTime = 0;
        }

        initialize() {
            this.setupVolumeMonitoring();
            this.setupMuteStateSync();
        }

        setupVolumeMonitoring() {
            document.addEventListener('volumechange', (e) => {
                if (e.target.tagName === 'VIDEO') {
                    this.handleVolumeChange(e.target);
                }
            }, true);
        }

        setupMuteStateSync() {
            setInterval(() => {
                this.syncMuteState();
            }, 1000);
        }

        handleVolumeChange(video) {
            const currentMuted = video.muted;
            const currentVolume = video.volume;
            const now = Date.now();

            if (now - this.lastVolumeChangeTime < 100) {
                return;
            }
            this.lastVolumeChangeTime = now;

            if (currentMuted !== this.controller.state.isMuted) {
                this.isExternalMute = true;
                console.log('检测到外部静音操作');
            }

            this.controller.setState({
                isMuted: currentMuted
            });

            if (!currentMuted && this.isExternalMute) {
                this.isExternalMute = false;
                if (currentVolume === 0) {
                    video.volume = this.volumeBeforeMute;
                }
            }

            if (!currentMuted && currentVolume > 0) {
                this.volumeBeforeMute = currentVolume;
            }

            this.controller.ui.updateMuteBtnState();
        }

        syncMuteState() {
            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (!targetVideo) return;

            const actualMuted = targetVideo.muted;

            if (actualMuted !== this.controller.state.isMuted) {
                console.log('静音状态不一致，同步状态:', {
                    controller: this.controller.state.isMuted,
                    actual: actualMuted
                });

                this.controller.setState({ isMuted: actualMuted });
                this.controller.ui.updateMuteBtnState();
            }
        }

        toggleMuteState(video) {
            if (!video) return;

            const newMutedState = !this.controller.state.isMuted;

            if (!video.muted && newMutedState) {
                this.volumeBeforeMute = video.volume;
            }

            video.muted = newMutedState;
            this.controller.setState({ isMuted: newMutedState });

            if (!newMutedState && video.volume === 0) {
                video.volume = this.volumeBeforeMute;
            }

            this.controller.ui.updateMuteBtnState();
            console.log(`静音状态切换: ${newMutedState ? '静音' : '取消静音'}`);
        }

        getVolumeInfo() {
            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (!targetVideo) return null;

            return {
                muted: targetVideo.muted,
                volume: targetVideo.volume,
                volumeBeforeMute: this.volumeBeforeMute,
                isExternalMute: this.isExternalMute
            };
        }
    }

    // =========================================================================
    // 模块7: 循环状态管理模块 (独立功能模块)
    // =========================================================================
    class FixedLoopStateManager {
        constructor(controller) {
            this.controller = controller;
            this.userOverrides = new Map();
        }

        isForceLoopSite() {
            return this.controller._isForcedPlaybackSite();
        }

        syncLoopStateFromVideo(video) {
            if (!video) return false;

            const videoId = this.controller.managers.video._getVideoUniqueId(video);

            if (this.userOverrides.has(videoId)) {
                const userOverride = this.userOverrides.get(videoId);
                if (this.controller.state.isLooping !== userOverride) {
                    this.controller.setState({ isLooping: userOverride });
                    this.controller.ui.updateLoopBtnState();
                }
                return userOverride;
            }

            let actualLoopState;

            if (this.isForceLoopSite()) {
                actualLoopState = this.detectActualLoopBehavior(video);
            } else {
                actualLoopState = video.loop || video.hasAttribute('loop');

                const forceLoop = this.detectForceLoopBehavior(video);
                actualLoopState = actualLoopState || forceLoop;
            }

            if (this.controller.state.isLooping !== actualLoopState) {
                this.controller.setState({ isLooping: actualLoopState });
                this.controller.ui.updateLoopBtnState();
            }

            return actualLoopState;
        }

        detectActualLoopBehavior(video) {
            if (video._loopBehaviorDetected !== undefined) {
                return video._loopBehaviorDetected;
            }

            const hasLoopAttributes = video.hasAttribute('loop') ||
                video.getAttribute('data-loop') === 'true' ||
                video.getAttribute('data-cycle') === 'true';

            const parentLoop = this.checkParentLoopAttributes(video);

            const autoRestart = this.checkAutoRestartBehavior(video);

            const actualLoop = hasLoopAttributes || parentLoop || autoRestart;
            video._loopBehaviorDetected = actualLoop;

            return actualLoop;
        }

        checkParentLoopAttributes(video) {
            let element = video.parentElement;
            for (let i = 0; i < 5; i++) {
                if (element && element !== document.body) {
                    if (element.hasAttribute('loop') ||
                        element.getAttribute('data-loop') === 'true' ||
                        element.classList.contains('loop') ||
                        element.classList.contains('cycle')) {
                        return true;
                    }
                    element = element.parentElement;
                } else {
                    break;
                }
            }
            return false;
        }

        checkAutoRestartBehavior(video) {
            if (!video._autoRestartChecked) {
                video._autoRestartChecked = true;
                video._autoRestartCount = 0;

                const timeUpdateHandler = () => {
                    if (video.currentTime < 1 && video._wasNearEnd) {
                        video._autoRestartCount++;
                        if (video._autoRestartCount >= 2) {
                            video._loopBehaviorDetected = true;
                            video.removeEventListener('timeupdate', timeUpdateHandler);
                        }
                        video._wasNearEnd = false;
                    }

                    if (video.duration > 0 && video.currentTime > video.duration - 1) {
                        video._wasNearEnd = true;
                    }
                };

                video.addEventListener('timeupdate', timeUpdateHandler);
            }

            return video._loopBehaviorDetected || false;
        }

        detectForceLoopBehavior(video) {
            if (!video._loopDetectionCount) {
                video._loopDetectionCount = 0;
                video._lastLoopCheckTime = Date.now();
            }

            const now = Date.now();
            if (now - video._lastLoopCheckTime > 5000) {
                video._loopDetectionCount = 0;
                video._lastLoopCheckTime = now;
            }

            if (video.currentTime < 1 && video._wasNearEnd) {
                video._loopDetectionCount++;
                video._wasNearEnd = false;

                if (video._loopDetectionCount >= 2) {
                    return true;
                }
            }

            if (video.duration > 0 && video.currentTime > video.duration - 1) {
                video._wasNearEnd = true;
            }

            return false;
        }

        setLoopState(video, loop) {
            if (!video) return false;

            const videoId = this.controller.managers.video._getVideoUniqueId(video);

            if (this.isForceLoopSite() && !loop) {
                this.userOverrides.set(videoId, false);
                console.log('用户覆盖强制循环状态: 关闭循环');

                this.controller.setState({ isLooping: false });
                this.controller.ui.updateLoopBtnState();

                try {
                    video.loop = false;
                    video.removeAttribute('loop');
                } catch (e) {
                    console.log('设置循环状态可能被网站覆盖:', e);
                }

                return true;
            } else if (this.isForceLoopSite() && loop) {
                this.userOverrides.delete(videoId);
                console.log('用户恢复强制循环状态: 开启循环');

                this.syncLoopStateFromVideo(video);
                return true;
            } else {
                try {
                    video.loop = loop;
                    if (loop) {
                        video.setAttribute('loop', '');
                    } else {
                        video.removeAttribute('loop');
                    }

                    this.controller.setState({ isLooping: loop });
                    this.controller.ui.updateLoopBtnState();
                    return true;
                } catch (e) {
                    console.log('设置循环状态失败:', e);
                    return false;
                }
            }
        }

        cleanupExpiredOverrides() {
        }
    }

    // =========================================================================
    // 模块8: 存储管理模块 (数据持久化模块)
    // =========================================================================
    class EnhancedStorageManager {
        constructor(controller) {
            this.controller = controller;
        }

        getVideoRecordKey(video) {
            if (!video) return null;
            const videoId = this.controller.managers.video._getVideoUniqueId(video);
            return `videoPlaybackRecord_${videoId}`;
        }

        getPlaybackRecord(video) {
            if (!video) return null;

            const recordKey = this.getVideoRecordKey(video);
            try {
                const savedRecord = JSON.parse(GM_getValue(recordKey, 'null'));
                return savedRecord;
            } catch (e) {
                console.log('读取播放记录失败:', e);
                return null;
            }
        }

        savePlaybackRecord(video) {
            if (!video || !this.controller._shouldSaveRecord()) return;

            if (video._forcedPlaybackSite && !video._userInteracted) {
                return;
            }

            const minPlayTime = this.controller.config.restoration.minPlayTimeToSave;
            if (video.currentTime < minPlayTime) return;

            const isShortVideo = video.duration > 0 && video.duration < 600;
            const shouldSave = isShortVideo || video.currentTime > 2;

            if (!shouldSave) return;

            const recordKey = this.getVideoRecordKey(video);
            const record = {
                currentTime: video.currentTime,
                duration: video.duration,
                timestamp: Date.now(),
                url: window.location.href,
                src: video.src || video.currentSrc || '',
                videoId: this.controller.managers.video._getVideoUniqueId(video),
                playbackRate: video.playbackRate || this.controller.state.playbackRate,
                containerInfo: this._getContainerInfo(video),
                forcedPlaybackSite: video._forcedPlaybackSite || false,
                pageTitle: document.title
            };

            try {
                GM_setValue(recordKey, JSON.stringify(record));
                console.log(`保存播放记录: ${recordKey}, 时间: ${video.currentTime.toFixed(1)}s`);
            } catch (e) {
                console.log('保存播放记录失败:', e);
                this.cleanupExpiredRecords();
            }
        }

        _getContainerInfo(video) {
            const container = this.controller.managers.video._findVideoContainer(video);
            if (!container) return null;

            return {
                id: this.controller.managers.video._getContainerIdentifier(container),
                tagName: container.tagName,
                className: container.className
            };
        }

        restorePlaybackPosition(video) {
            this.controller.managers.restoration.restorePlaybackPositionWithRetry(video);
        }

        saveVideoAudioModeState(video) {
            if (!video) return;
            const videoId = this.controller.managers.video._getVideoUniqueId(video);
            const stateKey = `videoAudioModeState_${videoId}`;

            GM_setValue(stateKey, JSON.stringify({
                isAudioMode: this.controller.state.isAudioMode,
                timestamp: Date.now()
            }));
        }

        restoreVideoAudioModeState(video) {
            if (!video) return;

            this.controller.setState({ isAudioMode: false });
            this.controller.managers.audio.restoreVideoMode(video);
            this.controller.ui.updateAudioBtnState();
        }

        cleanupExpiredRecords() {
            console.log('执行存储清理...');
        }
    }

    // =========================================================================
    // 模块9: 播放状态恢复模块 (独立功能模块)
    // =========================================================================
    class EnhancedRestorationManager {
        constructor(controller) {
            this.controller = controller;
            this.restorationAttempts = new Map();
            this.pendingRestorations = new Map();
        }

        initialize() {
            this.setupRestorationListeners();
        }

        setupRestorationListeners() {
            window.addEventListener('load', () => {
                setTimeout(() => {
                    this.attemptRestoreAllVideos();
                }, 1000);
            });

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => {
                        this.attemptRestoreAllVideos();
                    }, 500);
                });
            } else {
                setTimeout(() => {
                    this.attemptRestoreAllVideos();
                }, 500);
            }

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeName === 'VIDEO' || (node.querySelector && node.querySelector('video'))) {
                            setTimeout(() => {
                                this.attemptRestoreAllVideos();
                            }, 300);
                            break;
                        }
                    }
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }

        attemptRestoreAllVideos() {
            const videos = Array.from(document.querySelectorAll('video'));
            videos.forEach(video => {
                if (!video._playbackRestored && video.readyState >= 1) {
                    this.restorePlaybackPositionWithRetry(video);
                }
            });
        }

        async restorePlaybackPositionWithRetry(video) {
            if (!video || video._playbackRestored) return;

            const videoId = this.controller.managers.video._getVideoUniqueId(video);

            if (!this.restorationAttempts.has(videoId)) {
                this.restorationAttempts.set(videoId, 0);
            }

            const attempts = this.restorationAttempts.get(videoId);
            if (attempts >= this.controller.config.restoration.retryCount) {
                console.log(`视频 ${videoId} 恢复尝试次数已达上限`);
                return;
            }

            try {
                const savedRecord = this.controller.managers.storage.getPlaybackRecord(video);
                if (!savedRecord || !savedRecord.currentTime) {
                    return;
                }

                if (video.readyState < 2) {
                    await this.waitForVideoReady(video);
                }

                if (this.shouldRestorePlayback(video, savedRecord)) {
                    const targetTime = Math.min(
                        savedRecord.currentTime,
                        (video.duration || savedRecord.duration) - 1
                    );

                    video.currentTime = targetTime;
                    video._playbackRestored = true;

                    console.log(`成功恢复视频播放位置: ${targetTime.toFixed(1)}s, 尝试次数: ${attempts + 1}`);

                    if (savedRecord.playbackRate && savedRecord.playbackRate !== this.controller.state.playbackRate) {
                        setTimeout(() => {
                            this.controller.managers.video.setVideoSpeed(savedRecord.playbackRate);
                        }, 200);
                    }

                    this.restorationAttempts.delete(videoId);
                }
            } catch (error) {
                console.log(`视频恢复尝试 ${attempts + 1} 失败:`, error);
                this.restorationAttempts.set(videoId, attempts + 1);

                if (attempts + 1 < this.controller.config.restoration.retryCount) {
                    setTimeout(() => {
                        this.restorePlaybackPositionWithRetry(video);
                    }, this.controller.config.restoration.retryInterval);
                }
            }
        }

        waitForVideoReady(video) {
            return new Promise((resolve, reject) => {
                if (video.readyState >= 2) {
                    resolve();
                    return;
                }

                const onReady = () => {
                    video.removeEventListener('loadeddata', onReady);
                    video.removeEventListener('canplay', onReady);
                    video.removeEventListener('error', onError);
                    resolve();
                };

                const onError = () => {
                    video.removeEventListener('loadeddata', onReady);
                    video.removeEventListener('canplay', onReady);
                    video.removeEventListener('error', onError);
                    reject(new Error('视频加载失败'));
                };

                video.addEventListener('loadeddata', onReady, { once: true });
                video.addEventListener('canplay', onReady, { once: true });
                video.addEventListener('error', onError, { once: true });

                setTimeout(() => {
                    video.removeEventListener('loadeddata', onReady);
                    video.removeEventListener('canplay', onReady);
                    video.removeEventListener('error', onError);
                    reject(new Error('视频准备超时'));
                }, 5000);
            });
        }

        shouldRestorePlayback(video, savedRecord) {
            if (savedRecord.currentTime <= 0) {
                return false;
            }

            if (video._userInteracted) {
                return false;
            }

            const maxCurrentTime = this.controller.config.restoration.maxCurrentTimeToRestore;
            if (video.currentTime > maxCurrentTime) {
                return false;
            }

            if (this.controller._isBilibiliSite()) {
                return savedRecord.currentTime > 5 && video.currentTime < 10;
            }

            const duration = video.duration || savedRecord.duration;
            if (duration > 0) {
                if (duration < 60) {
                    return savedRecord.currentTime > 3 && video.currentTime < 5;
                } else if (duration < 300) {
                    return savedRecord.currentTime > 10 && video.currentTime < 15;
                } else {
                    return savedRecord.currentTime > 30 && video.currentTime < 20;
                }
            }

            return savedRecord.currentTime > 1 && video.currentTime < 10;
        }

        resetVideoRestorationState(video) {
            const videoId = this.controller.managers.video._getVideoUniqueId(video);
            this.restorationAttempts.delete(videoId);
            this.pendingRestorations.delete(videoId);
            video._playbackRestored = false;
        }
    }

    // =========================================================================
    // 模块10: 交互检测模块 (用户交互模块)
    // =========================================================================
    class EnhancedSwipeDetectionManager {
        constructor(controller) {
            this.controller = controller;
            this.touchStartX = 0;
            this.touchStartY = 0;
            this.touchStartTime = 0;
        }

        initialize() {
            this.setupTouchListeners();
        }

        setupTouchListeners() {
            document.addEventListener('touchstart', (e) => {
                this.touchStartX = e.touches[0].clientX;
                this.touchStartY = e.touches[0].clientY;
                this.touchStartTime = Date.now();
            }, { passive: true });

            document.addEventListener('touchend', (e) => {
                if (!this.controller.state.isAudioMode) return;

                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;
                const touchEndTime = Date.now();

                const deltaX = touchEndX - this.touchStartX;
                const deltaY = touchEndY - this.touchStartY;
                const deltaTime = touchEndTime - this.touchStartTime;

                if (this._isValidSwipe(deltaX, deltaY, deltaTime)) {
                    console.log('检测到滑动操作，准备退出音频模式');
                    this._handleEnhancedSwipeDetection();
                }
            }, { passive: true });
        }

        _isValidSwipe(deltaX, deltaY, deltaTime) {
            const { swipeThreshold, swipeTimeThreshold } = this.controller.config.detection;

            if (deltaTime > swipeTimeThreshold) return false;

            const absDeltaX = Math.abs(deltaX);
            const absDeltaY = Math.abs(deltaY);

            if (absDeltaX > swipeThreshold && absDeltaX > absDeltaY * 2) {
                return true;
            }

            if (absDeltaY > swipeThreshold && absDeltaY > absDeltaX * 2) {
                return true;
            }

            return false;
        }

        _handleEnhancedSwipeDetection() {
            if (!this.controller.state.isAudioMode) return;

            setTimeout(() => {
                const currentAudioVideo = this.controller.managers.audio.getCurrentAudioVideo();
                const currentTargetVideo = this.controller.managers.video.getTargetVideo();

                if (currentAudioVideo && currentTargetVideo && currentAudioVideo !== currentTargetVideo) {
                    console.log('滑动导致视频切换，退出音频模式');
                    this.controller.managers.audio.exitAudioMode();
                } else if (!currentTargetVideo) {
                    console.log('滑动后未检测到视频，退出音频模式');
                    this.controller.managers.audio.exitAudioMode();
                } else {
                    const isVideoVisible = this.controller.managers.video._getElementVisibility(currentAudioVideo) > 0.1;
                    if (!isVideoVisible) {
                        console.log('滑动后音频模式视频不可见，退出音频模式');
                        this.controller.managers.audio.exitAudioMode();
                    }
                }
            }, 500);
        }
    }

    class EnhancedScrollDetectionManager {
        constructor(controller) {
            this.controller = controller;
            this.lastScrollY = 0;
            this.lastScrollX = 0;
        }

        initialize() {
            this.setupScrollListener();
        }

        setupScrollListener() {
            let scrollTimeout;

            window.addEventListener('scroll', () => {
                if (!this.controller.state.isAudioMode) return;

                const currentScrollY = window.scrollY;
                const currentScrollX = window.scrollX;

                const deltaY = Math.abs(currentScrollY - this.lastScrollY);
                const deltaX = Math.abs(currentScrollX - this.lastScrollX);

                if (deltaY > this.controller.config.detection.scrollThreshold ||
                    deltaX > this.controller.config.detection.scrollThreshold) {
                    if (scrollTimeout) clearTimeout(scrollTimeout);

                    scrollTimeout = setTimeout(() => {
                        this._handleEnhancedScrollDetection();
                    }, 500);
                }

                this.lastScrollY = currentScrollY;
                this.lastScrollX = currentScrollX;
            }, { passive: true });
        }

        _handleEnhancedScrollDetection() {
            if (!this.controller.state.isAudioMode) return;

            const currentAudioVideo = this.controller.managers.audio.getCurrentAudioVideo();
            const currentTargetVideo = this.controller.managers.video.getTargetVideo();

            if (currentAudioVideo) {
                const isVideoVisible = this.controller.managers.video._getElementVisibility(currentAudioVideo) > 0.1;
                const isVideoInDOM = document.contains(currentAudioVideo);

                if (!isVideoVisible || !isVideoInDOM) {
                    console.log('滚动导致音频模式视频不可见或移除，退出音频模式');
                    this.controller.managers.audio.exitAudioMode();
                    return;
                }
            }

            if (currentAudioVideo && currentTargetVideo && currentAudioVideo !== currentTargetVideo) {
                console.log('滚动导致视频切换，退出音频模式');
                this.controller.managers.audio.exitAudioMode();
            }
        }
    }

    // =========================================================================
    // 模块11: 性能优化模块 (工具模块)
    // =========================================================================
    class BatchVideoOperationManager {
        constructor(controller) {
            this.controller = controller;
            this.pendingOperations = new Map();
            this.operationTimeouts = new Map();
        }

        batchSetVideoProperty(videos, property, value, delay = 0) {
            const operationKey = `${property}_${value}`;

            if (this.operationTimeouts.has(operationKey)) {
                clearTimeout(this.operationTimeouts.get(operationKey));
            }

            this.operationTimeouts.set(operationKey, setTimeout(() => {
                videos.forEach(video => {
                    try {
                        video[property] = value;
                    } catch (e) {
                        console.log(`设置视频${property}失败:`, e);
                    }
                });
                this.operationTimeouts.delete(operationKey);
            }, delay));
        }

        debouncedVideoSwitch(newVideo, delay = 50) {
            const switchKey = 'video_switch';

            if (this.operationTimeouts.has(switchKey)) {
                clearTimeout(this.operationTimeouts.get(switchKey));
            }

            this.operationTimeouts.set(switchKey, setTimeout(() => {
                this.controller.managers.video._handleVideoSwitch(newVideo);
                this.operationTimeouts.delete(switchKey);
            }, delay || this.controller.config.performance.videoSwitchDelay));
        }
    }

    // =========================================================================
    // 新增模块: 截图管理模块 (完整增强版 - 修复静默下载)
    // =========================================================================
    class ScreenshotManager {
        constructor(controller) {
            this.controller = controller;
            this.currentVideo = null;
            this.videoWasPlaying = false;
            this.originalTime = 0;
            this.overlay = null;
            this.crossOriginCache = new Map(); // 跨域设置缓存
        }

        initialize() {
            console.log('截图管理器初始化完成');
            // 从存储中恢复跨域设置
            this._loadCrossOriginSettings();
        }

        async takeScreenshots(videoElement) {
            if (!videoElement) {
                this._showNotification('截图提示', '未找到视频');
                return;
            }

            this.currentVideo = videoElement;
            this.videoWasPlaying = !videoElement.paused;
            this.originalTime = videoElement.currentTime;

            if (this.videoWasPlaying) {
                videoElement.pause();
            }

            this._showNotification('截图开始', '开始四连拍...', 1000);

            const timePoints = this.controller.config.screenshot.timePoints;
            const canvases = [];
            const domain = window.location.hostname;
            let useCrossOrigin = this._getCrossOriginSetting(domain);
            let hasTriedCrossOrigin = useCrossOrigin;

            // 跨域处理：如果需要跨域且视频没有crossorigin属性
            if (useCrossOrigin && !videoElement.hasAttribute('crossorigin')) {
                videoElement.setAttribute('crossorigin', 'anonymous');
                await this._reloadVideoForCrossOrigin(videoElement);
            }

            for (let i = 0; i < timePoints.length; i++) {
                const timeOffset = timePoints[i];
                const targetTime = Math.max(0, this.originalTime + timeOffset);

                try {
                    videoElement.currentTime = targetTime;

                    await new Promise(resolve => {
                        const onSeeked = () => {
                            videoElement.removeEventListener('seeked', onSeeked);
                            setTimeout(resolve, this.controller.config.screenshot.delayBetweenShots);
                        };
                        videoElement.addEventListener('seeked', onSeeked);
                        setTimeout(resolve, 500);
                    });

                    const canvas = await this._captureVideoFrame(videoElement);
                    if (canvas) {
                        // 首次成功且未尝试过跨域，保存不需要跨域的设置
                        if (i === 0 && !hasTriedCrossOrigin) {
                            this._saveCrossOriginSetting(domain, false);
                        }

                        canvases.push({
                            canvas: canvas,
                            absoluteTime: targetTime,
                            relativeTime: timeOffset
                        });

                        this._showNotification('截图进度', `已截取 ${i + 1}/${timePoints.length}`, 800);
                    } else if (i === 0 && !hasTriedCrossOrigin) {
                        // 首次失败且未尝试过跨域，尝试跨域模式
                        hasTriedCrossOrigin = true;
                        this._showNotification('截图提示', '尝试跨域模式...', 1000);
                        const success = await this._retryWithCrossOrigin(videoElement);
                        if (success) {
                            this._saveCrossOriginSetting(domain, true);
                            i = -1; // 重置循环
                            canvases.length = 0;
                            continue;
                        }
                    } else if (i === 0) {
                        this._showNotification('截图失败', '无法截取图片');
                        break;
                    }

                } catch (error) {
                    console.error(`截图时间点 ${targetTime} 失败:`, error);
                    if (i === 0 && !hasTriedCrossOrigin) {
                        hasTriedCrossOrigin = true;
                        this._showNotification('截图提示', '尝试跨域模式...', 1000);
                        const success = await this._retryWithCrossOrigin(videoElement);
                        if (success) {
                            this._saveCrossOriginSetting(domain, true);
                            i = -1; // 重置循环
                            canvases.length = 0;
                            continue;
                        }
                    }
                }

                if (i < timePoints.length - 1) {
                    videoElement.currentTime = this.originalTime;
                    await new Promise(resolve => setTimeout(resolve, this.controller.config.screenshot.delayBetweenShots));
                }
            }

            videoElement.currentTime = this.originalTime;

            if (canvases.length > 0) {
                this._showFourShotsResult(canvases);
                this._showNotification('截图完成', `成功截取 ${canvases.length} 张图片`, 1500);
            } else {
                this._showNotification('截图失败', '四连拍失败');
                this._resumeVideoPlayback();
            }
        }

        _loadCrossOriginSettings() {
            try {
                const settings = GM_getValue('screenshot_crossOrigin', '{}');
                const parsed = JSON.parse(settings);
                if (Array.isArray(parsed)) {
                    this.crossOriginCache = new Map(parsed);
                } else if (typeof parsed === 'object') {
                    this.crossOriginCache = new Map(Object.entries(parsed));
                }
            } catch (e) {
                console.warn('加载跨域设置失败:', e);
                this.crossOriginCache = new Map();
            }
        }

        _getCrossOriginSetting(domain) {
            return this.crossOriginCache.get(domain) || false;
        }

        _saveCrossOriginSetting(domain, useCrossOrigin) {
            this.crossOriginCache.set(domain, useCrossOrigin);
            try {
                GM_setValue('screenshot_crossOrigin', JSON.stringify([...this.crossOriginCache]));
            } catch (e) {
                console.error('保存跨域设置失败:', e);
            }
        }

        async _reloadVideoForCrossOrigin(video) {
            return new Promise((resolve) => {
                if (!video) {
                    resolve(false);
                    return;
                }

                const currentSrc = video.src;
                const wasPlaying = !video.paused;
                const currentTime = video.currentTime;

                const onLoad = () => {
                    video.removeEventListener('loadeddata', onLoad);
                    video.currentTime = currentTime;

                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        if (wasPlaying) {
                            video.play().catch(() => { });
                        }
                        resolve(true);
                    };
                    video.addEventListener('seeked', onSeeked);
                };

                video.addEventListener('loadeddata', onLoad, { once: true });
                video.src = currentSrc;
                video.load();
            });
        }

        _captureVideoFrame(video) {
            return new Promise((resolve) => {
                const width = video.videoWidth;
                const height = video.videoHeight;

                if (width === 0 || height === 0) {
                    resolve(null);
                    return;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d', { willReadFrequently: false });

                try {
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(video, 0, 0, width, height);

                    try {
                        ctx.getImageData(0, 0, 1, 1);
                        resolve(canvas);
                    } catch (error) {
                        resolve(null);
                    }
                } catch (error) {
                    resolve(null);
                }
            });
        }

        async _retryWithCrossOrigin(video) {
            return new Promise((resolve) => {
                if (!video) {
                    resolve(false);
                    return;
                }

                video.setAttribute('crossorigin', 'anonymous');
                const currentSrc = video.src;

                const onLoad = () => {
                    video.removeEventListener('loadeddata', onLoad);
                    video.currentTime = this.originalTime;

                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        resolve(true);
                    };
                    video.addEventListener('seeked', onSeeked);
                };

                video.addEventListener('loadeddata', onLoad, { once: true });
                video.src = currentSrc;
                video.load();
            });
        }

        _resumeVideoPlayback() {
            if (this.currentVideo && this.videoWasPlaying) {
                this.currentVideo.play().catch(e => {
                    console.log('恢复播放失败:', e);
                });
            }
            this.currentVideo = null;
        }

        _formatTime(seconds) {
            const minutes = Math.floor(seconds / 60);
            const secs = (seconds % 60).toFixed(1);
            return `${minutes.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
        }

        _getVideoTitle(video) {
            // 复用主脚本的标题获取逻辑
            if (!video) return 'video';

            try {
                let title = video.getAttribute('title') ||
                    video.getAttribute('aria-label') ||
                    document.title;

                if (title) {
                    // 清理文件名中的非法字符
                    title = title.replace(/[<>:"/\\|?*]/g, '_')
                        .replace(/\s+/g, '_')
                        .replace(/_+/g, '_')
                        .substring(0, 100);
                }

                return title || 'video';
            } catch (e) {
                return document.title ? document.title.split(' - ')[0] : 'video';
            }
        }

        _detectImageQuality(canvas) {
            // 检测图像质量
            const pixels = canvas.width * canvas.height;
            if (pixels >= 3840 * 2160) return '4K';
            if (pixels >= 2560 * 1440) return '2K';
            if (pixels >= 1920 * 1080) return '1080P';
            if (pixels >= 1280 * 720) return '720P';
            return 'SD';
        }

        _generateScreenshotFilename(canvas, absoluteTime, index) {
            // 继承主脚本的命名逻辑
            const videoTitle = this._getVideoTitle(this.currentVideo);
            const timeStr = this._formatTime(absoluteTime).replace(/:/g, '-');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const quality = this._detectImageQuality(canvas);

            return `${videoTitle}_截图_${quality}_${timeStr}_${timestamp}_${index + 1}.png`;
        }

        _showFourShotsResult(canvasData) {
            this.overlay = document.createElement('div');
            this.overlay.className = 'screenshot-overlay';

            const previewContainer = document.createElement('div');
            previewContainer.className = 'screenshot-preview';

            const screenWidth = window.innerWidth;
            const screenHeight = window.innerHeight;
            const screenRatio = screenWidth / screenHeight;

            const firstCanvas = canvasData[0].canvas;
            const imageRatio = firstCanvas.width / firstCanvas.height;

            let gridStyle, imageMaxWidth, imageMaxHeight, gridGap;

            if (screenRatio > 1) {
                // 横屏设备
                if (imageRatio > 1) {
                    gridStyle = 'grid-template-columns: 1fr 1fr;';
                    gridGap = '8px';
                    imageMaxWidth = (screenWidth * 0.6) / 2;
                    imageMaxHeight = screenHeight * 0.22;
                } else {
                    gridStyle = 'grid-template-columns: 1fr;';
                    gridGap = '12px';
                    imageMaxWidth = screenWidth * 0.65;
                    imageMaxHeight = screenHeight * 0.18;
                }
            } else {
                // 竖屏设备
                if (imageRatio > 1) {
                    // 横屏图片：1x4单列
                    gridStyle = 'grid-template-columns: 1fr;';
                    const availableHeight = screenHeight - 100;
                    const maxImageHeight = (availableHeight - (3 * 6)) / 4;

                    gridGap = '6px';
                    imageMaxWidth = screenWidth * 0.88;
                    imageMaxHeight = Math.min(maxImageHeight, screenHeight * 0.19);
                } else {
                    // 竖屏图片：2x2网格
                    gridStyle = 'grid-template-columns: 1fr 1fr;';
                    gridGap = '10px';
                    imageMaxWidth = (screenWidth * 0.65) / 2;
                    imageMaxHeight = screenHeight * 0.35;
                }
            }

            const gridContainer = document.createElement('div');
            gridContainer.className = 'screenshot-grid';
            gridContainer.style.cssText = gridStyle + `grid-gap: ${gridGap};`;

            canvasData.forEach((data, index) => {
                const imgContainer = document.createElement('div');
                imgContainer.className = 'screenshot-item';

                const img = new Image();
                img.src = data.canvas.toDataURL('image/png');

                if (imageRatio > 1) {
                    img.style.cssText = `
                    max-width: ${imageMaxWidth}px;
                    max-height: ${imageMaxHeight}px;
                    width: 100%;
                    height: auto;
                    display: block;
                    border-radius: 6px;
                `;
                } else {
                    img.style.cssText = `
                    max-width: ${imageMaxWidth}px;
                    max-height: ${imageMaxHeight}px;
                    width: auto;
                    height: 100%;
                    display: block;
                    border-radius: 6px;
                `;
                }

                const timeLabel = document.createElement('div');
                timeLabel.className = 'screenshot-time';
                timeLabel.textContent = this._formatTime(data.absoluteTime);

                const relativeTimeLabel = document.createElement('div');
                relativeTimeLabel.className = 'screenshot-relative-time';
                relativeTimeLabel.textContent = data.relativeTime >= 0 ?
                    `+${data.relativeTime.toFixed(1)}s` :
                    `${data.relativeTime.toFixed(1)}s`;

                imgContainer.appendChild(img);
                imgContainer.appendChild(timeLabel);
                imgContainer.appendChild(relativeTimeLabel);

                // 点击图片时下载并自动关闭预览
                imgContainer.addEventListener('click', () => {
                    this._downloadScreenshot(data.canvas, data.absoluteTime, index);
                });

                gridContainer.appendChild(imgContainer);
            });

            const closeButton = document.createElement('div');
            closeButton.className = 'screenshot-close';
            closeButton.innerHTML = '×';
            closeButton.addEventListener('click', () => {
                this._closePreview();
            });

            previewContainer.appendChild(closeButton);
            previewContainer.appendChild(gridContainer);
            this.overlay.appendChild(previewContainer);
            document.body.appendChild(this.overlay);

            setTimeout(() => {
                this.overlay.classList.add('show');
            }, 10);
        }

        _downloadScreenshot(canvas, absoluteTime, index) {
            try {
                const filename = this._generateScreenshotFilename(canvas, absoluteTime, index);

                // 转换为blob
                canvas.toBlob((blob) => {
                    if (blob) {
                        // 方法1：尝试使用File API创建文件并下载
                        try {
                            const file = new File([blob], filename, { type: 'image/png' });
                            const url = URL.createObjectURL(file);

                            // 创建下载链接
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = filename;
                            a.style.display = 'none';

                            // 添加到DOM并触发点击
                            document.body.appendChild(a);
                            a.click();

                            // 清理
                            setTimeout(() => {
                                document.body.removeChild(a);
                                URL.revokeObjectURL(url);

                                // 显示成功通知并关闭预览
                                this._showNotification('下载成功', `截图已保存: ${filename}`, 3000);
                                this._closePreview();
                            }, 100);

                        } catch (error) {
                            console.error('File API失败，尝试降级方法:', error);
                            this._fallbackDownload(canvas, filename, absoluteTime, index);
                        }
                    } else {
                        throw new Error('Canvas转换blob失败');
                    }
                }, 'image/png');

            } catch (error) {
                console.error('下载失败:', error);
                this._showNotification('下载失败', '无法下载图片', 3000);
                // 即使下载失败也要关闭预览，避免用户卡住
                setTimeout(() => {
                    this._closePreview();
                }, 1000);
            }
        }

        _fallbackDownload(canvas, filename, absoluteTime, index) {
            try {
                // 方法2：直接使用data URL
                const dataUrl = canvas.toDataURL('image/png');

                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = filename;
                a.style.display = 'none';

                document.body.appendChild(a);
                a.click();

                setTimeout(() => {
                    document.body.removeChild(a);
                    this._showNotification('下载成功', `截图已保存: ${filename}`, 3000);
                    this._closePreview();
                }, 100);

            } catch (error) {
                console.error('降级下载也失败:', error);
                this._showNotification('下载失败', '无法下载图片', 3000);
                // 最后的保障：强制关闭预览
                setTimeout(() => {
                    this._closePreview();
                }, 1000);
            }
        }

        _closePreview() {
            if (this.overlay) {
                this.overlay.classList.remove('show');
                setTimeout(() => {
                    if (this.overlay && this.overlay.parentNode) {
                        document.body.removeChild(this.overlay);
                    }
                    this.overlay = null;
                }, 300);
            }
            // 关闭预览后恢复视频播放
            this._resumeVideoPlayback();
        }

        _showNotification(title, message, timeout = 2000) {
            if (typeof GM_notification !== 'undefined') {
                GM_notification({
                    title: title,
                    text: message,
                    timeout: timeout,
                    silent: true
                });
            } else {
                console.log(`${title}: ${message}`);
            }
        }

        destroy() {
            if (this.overlay) {
                this._closePreview();
            }
            console.log('截图管理器已销毁');
        }
    }


    // =========================================================================
    // 模块12: UI管理模块 (界面模块) - 重写版
    // =========================================================================
    class EnhancedUIManager {
        constructor(controller) {
            this.controller = controller;
            this.controlsContainer = null;
            this.mainBtn = null;
            this.speedPanel = null;
            this.playPauseBtn = null;
            this.loopBtn = null;
            this.muteBtn = null;
            this.audioBtn = null;
            this.replayBtn = null;
            this.captureBtn = null;
            this.progressCircle = null;
            this.progressInterval = null;
        }

        createStyles() {
            if (document.querySelector("#myPbrStyles")) return;

            const myCss = document.createElement("style");
            myCss.id = "myPbrStyles";
            myCss.innerHTML = this._getStyles();
            document.head.appendChild(myCss);
        }

        _getStyles() {
            const config = this.controller.config.ui;

            return `
        div#myPbrMain {
            padding: 0; margin: 0; width: auto;
            position: fixed; bottom: ${config.position.bottom}; left: ${config.position.left}; 
            z-index: 2147483647;
            display: flex; flex-direction: column; align-items: flex-end;
        }
        div#myPbrMain>div.myPbrBtns { 
            width: auto; 
            margin-bottom: 1.2vw; 
            display: none; 
        }
        div.myPbrBtns { 
            opacity: 0; 
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 0.8vw;
        }
        .playPauseBtn-container {
            position: relative;
            margin-bottom: 1.2vw;
            width: ${config.sizes.progress};
            height: ${config.sizes.progress};
            display: flex;
            align-items: center;
            justify-content: center;
        }
        div.myPbrBtn {
            color: ${config.colors.primary}; 
            cursor: pointer; 
            white-space: nowrap; 
            text-align: center; 
            background: transparent;
            border: 1px solid ${config.colors.secondary};
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            border-radius: 50%;
        }
        div.playPauseBtn, div.mainSpeedBtn {
            width: ${config.sizes.main};
            height: ${config.sizes.main};
            font-size: 3.2vw;
        }
        div.audioBtn, div.muteBtn, div.loopBtn, div.replayBtn, div.captureBtn, div.speedBtn, div.screenshotBtn {
            width: ${config.sizes.secondary};
            height: ${config.sizes.secondary};
            font-size: 2.8vw !important;
        }
        div.speedBtn {
            background: transparent !important;
            border: 1px solid ${config.colors.secondary} !important;
        }
        div.mainSpeedBtn {
            background: transparent !important;
            border: 1px solid ${config.colors.secondary} !important;
        }
        div.playPauseBtn {
            background: ${config.colors.background} !important;
            border: 1px solid ${config.colors.primary} !important;
            opacity: 1 !important;
            position: relative;
            z-index: 2;
        }
        div.audioBtn, div.muteBtn, div.loopBtn, div.replayBtn, div.captureBtn, div.screenshotBtn {
            background: transparent !important;
            border: 1px solid ${config.colors.secondary} !important;
        }
        div.audioBtn.active, div.muteBtn.active, div.loopBtn.active, div.replayBtn.active, div.captureBtn.active, div.screenshotBtn.active, div.speedBtn.active {
            background: ${config.colors.background} !important;
            border: 1px solid ${config.colors.primary} !important;
        }
        .circular-progress {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 1;
            pointer-events: none;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .progress-ring {
            width: ${config.sizes.progress};
            height: ${config.sizes.progress};
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .progress-ring-background {
            stroke: ${config.colors.secondary};
        }
        .progress-ring-circle {
            stroke: ${config.colors.primary};
            stroke-linecap: round;
            transition: stroke-dashoffset 0.3s ease;
            transform: rotate(-90deg);
            transform-origin: 50% 50%;
        }
        div.myPbrBtn:hover {
            background: rgba(255,255,255,0.1) !important;
        }
        div.playPauseBtn:hover {
            background: ${config.colors.background} !important;
            opacity: 1 !important;
        }
        div.audioBtn.active:hover, div.muteBtn.active:hover, div.loopBtn.active:hover, div.replayBtn.active:hover, div.captureBtn.active:hover, div.screenshotBtn:hover, div.speedBtn.active:hover {
            background: ${config.colors.background} !important;
        }
        div.speedBtn:hover, div.mainSpeedBtn:hover {
            background: rgba(255,255,255,0.1) !important;
        }
        div#myPbrMain * { 
            box-sizing: content-box; 
            word-break: normal; 
        }
        div.show { 
            animation: shower 0.3s; 
            opacity: 1; 
            display: flex !important;
            flex-direction: column;
        }
        div.hidden { 
            animation: hiddener 0.3s; 
            opacity: 0; 
            display: none; 
        }
        @keyframes shower { 
            from { opacity: 0; } 
            to { opacity: 1; } 
        }
        @keyframes hiddener { 
            from { opacity: 1; } 
            to { opacity: 0; } 
        }
        
        /* 截图功能样式 */
        .screenshot-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.95);
            z-index: 2147483647 !important;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 5px;
            box-sizing: border-box;
            overflow: hidden;
        }
        
        .screenshot-preview {
            background: #1a1a1a;
            border-radius: 15px;
            padding: 10px;
            max-width: 95%;
            max-height: 95%;
            display: flex;
            flex-direction: column;
            align-items: center;
            overflow: hidden;
            position: relative;
            z-index: 2147483647;
        }
        
        .screenshot-grid {
            display: grid;
            grid-gap: 6px;
            width: 100%;
            height: 100%;
            overflow-y: auto;
        }
        
        .screenshot-item {
            position: relative;
            display: flex;
            justify-content: center;
            align-items: center;
            background: #333;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            touch-action: manipulation;
            padding: 2px;
        }
        
        .screenshot-time {
            position: absolute;
            bottom: 4px;
            left: 4px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            pointer-events: none;
            z-index: 1;
        }
        
        .screenshot-relative-time {
            position: absolute;
            top: 4px;
            right: 4px;
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 2px 4px;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            pointer-events: none;
            z-index: 1;
        }
        
        .screenshot-close {
            position: absolute;
            top: 10px;
            left: 10px;
            z-index: 2147483647 !important;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: rgba(0,0,0,0.8);
            color: white;
            border: 1px solid white;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            touch-action: manipulation;
        }
        
        @keyframes shower { 
            from { opacity: 0; transform: translateY(10px); } 
            to { opacity: 1; transform: translateY(0); } 
        }
    `;
        }

        createControls() {
            const existingControls = document.getElementById("myPbrMain");
            if (existingControls) {
                existingControls.remove();
            }

            this.controlsContainer = document.createElement("div");
            this.controlsContainer.id = "myPbrMain";

            this.controlsContainer.innerHTML = this._getControlsHTML();
            document.body.appendChild(this.controlsContainer);

            this._initializeControlElements();
            this.setMainBtnTxt();
            this.updatePlayPauseBtnText();
            this.updateLoopBtnState();
            this.updateMuteBtnState();
            this.updateAudioBtnState();
            this._bindButtonEvents();
        }

        _getControlsHTML() {
            return `
        <div class="myPbrBtns hidden">
            <div class="myPbrBtn speedBtn audioBtn" id="myPbrBtn_Audio">视频</div>
            <div class="myPbrBtn speedBtn muteBtn" id="myPbrBtn_Mute">声音</div>
            <div class="myPbrBtn speedBtn loopBtn" id="myPbrBtn_Loop">单次</div>
            <div class="myPbrBtn speedBtn replayBtn" id="myPbrBtn_Replay">重播</div>
            <div class="myPbrBtn speedBtn screenshotBtn" id="myPbrBtn_Screenshot">截图</div>
            <div class="myPbrBtn speedBtn captureBtn" id="myPbrBtn_Capture" style="display:none">抓取</div>
            <div class="myPbrBtn speedBtn" id="myPbrBtn_80">8.0x</div>
            <div class="myPbrBtn speedBtn" id="myPbrBtn_20">2.0x</div>
            <div class="myPbrBtn speedBtn" id="myPbrBtn_10">1.0x</div>
            <div class="myPbrBtn speedBtn" id="myPbrBtn_05">0.5x</div>
        </div>
        <div class="playPauseBtn-container">
            <div class="circular-progress" id="myPbrProgressCircle">
                <div class="progress-ring">
                    <svg width="100%" height="100%" viewBox="0 0 44 44">
                        <circle class="progress-ring-background" cx="22" cy="22" r="20" stroke-width="2.5" fill="transparent"></circle>
                        <circle class="progress-ring-circle" cx="22" cy="22" r="20" stroke-width="2.5" fill="transparent" 
                                stroke-dasharray="125.66" stroke-dashoffset="125.66"></circle>
                    </svg>
                </div>
            </div>
            <div class="myPbrBtn playPauseBtn" id="myPbrBtn_PlayPause">◎</div>
        </div>
        <div class="myPbrBtn mainSpeedBtn" id="myPbrBtn_Main">1.0x</div>   
        `;
        }

        _initializeControlElements() {
            this.mainBtn = this.controlsContainer.querySelector("#myPbrBtn_Main");
            this.speedPanel = this.controlsContainer.querySelector(".myPbrBtns");
            this.playPauseBtn = this.controlsContainer.querySelector("#myPbrBtn_PlayPause");
            this.loopBtn = this.controlsContainer.querySelector("#myPbrBtn_Loop");
            this.muteBtn = this.controlsContainer.querySelector("#myPbrBtn_Mute");
            this.audioBtn = this.controlsContainer.querySelector("#myPbrBtn_Audio");
            this.replayBtn = this.controlsContainer.querySelector("#myPbrBtn_Replay");
            this.screenshotBtn = this.controlsContainer.querySelector("#myPbrBtn_Screenshot");
            this.captureBtn = this.controlsContainer.querySelector("#myPbrBtn_Capture");
            this.progressCircle = this.controlsContainer.querySelector("#myPbrProgressCircle .progress-ring-circle");
        }

        _bindButtonEvents() {
            this.mainBtn.onclick = () => this._toggleSpeedPanel();
            this.playPauseBtn.onclick = () => this._handlePlayPause();
            this.audioBtn.onclick = () => this.controller.managers.audio.toggleAudioMode();
            this.muteBtn.onclick = () => this._handleMute();

            this.loopBtn.onclick = () => {
                const targetVideo = this.controller.managers.video.getTargetVideo();
                if (targetVideo) {
                    const newLoopState = !this.controller.state.isLooping;
                    const success = this.controller.managers.loop.setLoopState(targetVideo, newLoopState);

                    if (success) {
                        this.hideSpeedPanel();
                    } else {
                        setTimeout(() => {
                            this.controller.managers.loop.syncLoopStateFromVideo(targetVideo);
                        }, 100);
                    }
                }
            };

            this.replayBtn.onclick = () => this._handleReplay();
            this.screenshotBtn.onclick = () => this._handleScreenshot();
            this.captureBtn.onclick = () => this._handleCapture();

            const speedButtons = this.speedPanel.querySelectorAll(".speedBtn:not(.audioBtn):not(.muteBtn):not(.loopBtn):not(.replayBtn):not(.captureBtn):not(.screenshotBtn)");
            speedButtons.forEach(btn => {
                const speedText = btn.textContent;
                if (speedText.includes('x')) {
                    const speed = parseFloat(speedText.replace('x', ''));
                    btn.onclick = () => {
                        const targetVideo = this.controller.managers.video.getTargetVideo();
                        if (targetVideo) {
                            targetVideo._userInteracted = true;
                        }
                        this.controller.managers.video.setVideoSpeed(speed);
                        this.updateSpeedButtonsState(); // 更新速度按钮状态
                    };
                }
            });
        }

        _handleScreenshot() {
            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (targetVideo) {
                targetVideo._userInteracted = true;
                this.controller.managers.screenshot.takeScreenshots(targetVideo);
                this.hideSpeedPanel();
            } else {
                this.controller.managers.download._showNotification('无法截图', '未找到可截图的视频');
            }
        }

        _toggleSpeedPanel() {
            this.speedPanel.classList.toggle("hidden");
            this.speedPanel.classList.toggle("show");

            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (targetVideo && this._canCaptureVideo(targetVideo)) {
                this.captureBtn.style.display = 'flex';
            } else {
                this.captureBtn.style.display = 'none';
            }

            // 更新速度按钮状态
            this.updateSpeedButtonsState();
        }

        _handlePlayPause() {
            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (targetVideo) {
                targetVideo._userInteracted = true;

                if (!targetVideo._hasPlayedOnce && !targetVideo._playbackRestored) {
                    this.controller.managers.restoration.restorePlaybackPositionWithRetry(targetVideo);
                    targetVideo._hasPlayedOnce = true;
                }
                this.controller.managers.video.togglePlayPauseReliable(targetVideo);

                this.hideSpeedPanel();
            }
        }

        _handleMute() {
            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (targetVideo) {
                targetVideo._userInteracted = true;
                this.controller.managers.audioState.toggleMuteState(targetVideo);
                this.hideSpeedPanel();
            }
        }

        _handleReplay() {
            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (targetVideo) {
                targetVideo._userInteracted = true;

                const recordKey = this.controller.managers.storage.getVideoRecordKey(targetVideo);
                GM_setValue(recordKey, null);

                targetVideo.currentTime = 0;
                targetVideo._playbackRestored = true;

                if (targetVideo.paused) {
                    targetVideo.play().catch(e => console.log('重播失败:', e));
                }

                this.hideSpeedPanel();
            }
        }

        _handleCapture() {
            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (targetVideo && this._canCaptureVideo(targetVideo)) {
                targetVideo._userInteracted = true;

                this.controller.managers.download._showNotification('开始分析', '正在分析可用资源...');

                this.controller.managers.download.downloadBestResource(targetVideo)
                    .then(success => {
                        console.log(`下载完成，结果: ${success ? '成功' : '失败'}`);
                    })
                    .catch(error => {
                        console.error('抓取过程发生错误:', error);
                        this.controller.managers.download._showNotification('抓取错误', '下载过程中发生异常: ' + error.message);
                    });

                this.hideSpeedPanel();
            } else {
                this.controller.managers.download._showNotification('无法抓取', '当前视频没有可下载的资源链接');
            }
        }

        _canCaptureVideo(video) {
            if (!video) return false;

            const resources = this.controller.managers.resourceAnalyzer.enhancedResourceSniffing(video);
            const analyzedResources = this.controller.managers.resourceAnalyzer.analyzeResources(resources);

            return analyzedResources.length > 0;
        }

        updateAudioBtnState() {
            if (!this.audioBtn) return;

            const isAudioMode = this.controller.state.isAudioMode;
            const hasAudioVideo = !!this.controller.managers.audio.getCurrentAudioVideo();

            if (isAudioMode && !hasAudioVideo) {
                console.warn('状态不一致：音频模式开启但没有音频模式视频');
                this.controller.setState({ isAudioMode: false });
            }

            if (this.controller.state.isAudioMode) {
                this.audioBtn.textContent = "音频";
                this.audioBtn.classList.add("active");
            } else {
                this.audioBtn.textContent = "视频";
                this.audioBtn.classList.remove("active");
            }

            console.log('更新音频按钮状态:', {
                isAudioMode: this.controller.state.isAudioMode,
                buttonText: this.audioBtn.textContent,
                hasActiveClass: this.audioBtn.classList.contains("active")
            });
        }

        ensureControlsVisible() {
            if (!this.controlsContainer) {
                this.createControls();
            }

            if (this.controlsContainer) {
                const hasTargetVideo = !!this.controller.managers.video.getTargetVideo();
                const isAudioMode = this.controller.state.isAudioMode;
                const hasAudioVideo = !!this.controller.managers.audio.getCurrentAudioVideo();

                const shouldShow = hasTargetVideo || isAudioMode || hasAudioVideo;

                if (shouldShow) {
                    this.controlsContainer.style.display = 'flex';
                } else {
                    this.controlsContainer.style.display = 'none';
                }

                console.log('控制界面显示状态:', {
                    shouldShow,
                    hasTargetVideo,
                    isAudioMode,
                    hasAudioVideo
                });
            }
        }

        updateControlsForVideo(video) {
            if (!video) return;

            const isAudioMode = this.controller.state.isAudioMode;
            const isActuallyInAudioMode = this.controller.managers.audio.isInAudioMode(video);

            if (isAudioMode !== isActuallyInAudioMode) {
                console.warn('音频模式状态不一致，同步状态', {
                    controllerState: isAudioMode,
                    actualState: isActuallyInAudioMode
                });
                this.controller.setState({ isAudioMode: isActuallyInAudioMode });
            }

            this.controller.setState({
                isPlaying: !video.paused,
                isMuted: video.muted
            });

            this.updatePlayPauseBtnText();
            this.updateMuteBtnState();
            this.updateLoopBtnState();
            this.updateAudioBtnState();
            this.updateProgressCircle();

            if (video.playbackRate !== this.controller.state.playbackRate) {
                this.controller.setState({ playbackRate: video.playbackRate });
                this.setMainBtnTxt();
            }

            // 更新速度按钮状态
            this.updateSpeedButtonsState();
        }

        syncVideoStateToBtn() {
            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (targetVideo) {
                this.updateControlsForVideo(targetVideo);
            }
        }

        updateLoopBtnState() {
            if (this.loopBtn) {
                if (this.controller.state.isLooping) {
                    this.loopBtn.textContent = "循环";
                    this.loopBtn.classList.add("active");
                } else {
                    this.loopBtn.textContent = "单次";
                    this.loopBtn.classList.remove("active");
                }
            }
        }

        updateMuteBtnState() {
            if (this.muteBtn) {
                if (!this.controller.state.isMuted) {
                    this.muteBtn.textContent = "声音";
                    this.muteBtn.classList.add("active");
                } else {
                    this.muteBtn.textContent = "静音";
                    this.muteBtn.classList.remove("active");
                }
            }
        }

        updatePlayPauseBtnText() {
            if (this.playPauseBtn) {
                this.playPauseBtn.textContent = this.controller.state.isPlaying ? "○" : "◎";
            }
        }

        setMainBtnTxt() {
            if (this.mainBtn) {
                const targetVideo = this.controller.managers.video.getTargetVideo();
                if (targetVideo && targetVideo.duration) {
                    // 获取总秒数
                    const totalSeconds = Math.floor(targetVideo.duration);

                    // 转换为分:秒格式，个位数分钟前面补0
                    const minutes = Math.floor(totalSeconds / 60);
                    const seconds = totalSeconds % 60;
                    let timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

                    // 计算数字总数（不包括冒号）
                    const digitsOnly = timeStr.replace(/:/g, '');

                    // 如果超过4个数字，则缩减后面的数字
                    if (digitsOnly.length > 4) {
                        const keepDigits = digitsOnly.substring(0, 4);
                        // 重新组合，保持冒号位置和分钟补零格式
                        if (keepDigits.length >= 2) {
                            const minDigits = keepDigits.substring(0, keepDigits.length - 2);
                            const secDigits = keepDigits.substring(keepDigits.length - 2);
                            // 确保分钟部分保持两位数格式
                            const paddedMin = minDigits.padStart(2, '0');
                            timeStr = `${paddedMin}:${secDigits}`;
                        } else {
                            // 不足2位秒数的情况
                            const paddedMin = keepDigits.padStart(2, '0');
                            timeStr = `${paddedMin}:`;
                        }
                    }

                    this.mainBtn.innerHTML = timeStr;
                } else {
                    this.mainBtn.innerHTML = '--:--';
                }
            }
        }

        updateSpeedButtonsState() {
            const currentSpeed = this.controller.state.playbackRate;
            const speedButtons = this.speedPanel.querySelectorAll(".speedBtn:not(.audioBtn):not(.muteBtn):not(.loopBtn):not(.replayBtn):not(.captureBtn):not(.screenshotBtn)");
            speedButtons.forEach(btn => {
                const speedText = btn.textContent;
                if (speedText.includes('x')) {
                    const speed = parseFloat(speedText.replace('x', ''));
                    if (Math.abs(speed - currentSpeed) < 0.01) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                }
            });
        }

        updateProgressCircle() {
            if (!this.progressCircle) return;

            const targetVideo = this.controller.managers.video.getTargetVideo();
            if (targetVideo && targetVideo.duration > 0) {
                const progress = targetVideo.currentTime / targetVideo.duration;
                const circumference = 2 * Math.PI * 20;
                const offset = circumference - progress * circumference;
                this.progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
                this.progressCircle.style.strokeDashoffset = offset;
            } else {
                this.progressCircle.style.strokeDashoffset = '125.66';
            }
        }

        startProgressUpdate() {
            if (this.progressInterval) {
                clearInterval(this.progressInterval);
            }

            this.progressInterval = setInterval(() => {
                this.updateProgressCircle();
                // 同时更新主按钮显示的时间
                this.setMainBtnTxt();
            }, this.controller.config.detection.progressUpdateInterval);
        }

        hideSpeedPanel() {
            if (this.speedPanel) {
                this.speedPanel.classList.remove("show");
                this.speedPanel.classList.add("hidden");
                this.captureBtn.style.display = 'none';
            }
        }
    }



    // =========================================================================
    // 启动H5媒体播控器
    // =========================================================================
    new VideoSpeedController();

})();

