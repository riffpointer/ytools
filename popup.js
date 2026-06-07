// popup.js - Handles extension UI and communication with content script

document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('btn-scan');
    const clearBtn = document.getElementById('btn-clear');
    const copyBtn = document.getElementById('btn-copy');
    const exportCsvBtn = document.getElementById('btn-export-csv');
    const videoList = document.getElementById('video-list');
    const statusContainer = document.getElementById('status-container');
    const channelWarning = document.getElementById('channel-warning');
    const scanningIndicator = document.getElementById('scanning-indicator');
    const videoCountText = document.getElementById('video-count');
    const scannerDashboard = document.getElementById('scanner-dashboard');
    const thumbnailWarning = document.getElementById('thumbnail-warning');
    const thumbnailWarningTitle = document.getElementById('thumbnail-warning-title');
    const thumbnailWarningDesc = document.getElementById('thumbnail-warning-desc');
    const thumbnailDashboard = document.getElementById('thumbnail-dashboard');
    const thumbnailList = document.getElementById('thumbnail-list');
    const thumbnailCountText = document.getElementById('thumbnail-count');
    const refreshThumbnailsBtn = document.getElementById('btn-refresh-thumbnails');
    const copyThumbnailPageBtn = document.getElementById('btn-copy-thumbnail-page');

    let currentVideos = [];
    let isCurrentlyScanning = false;
    let port = null;
    let currentPageUrl = '';
    let currentIsYouTubePage = false;
    let thumbnailRenderToken = 0;
    let lastThumbnailRenderKey = '';
    const thumbnailCache = new Map();

    const THUMBNAIL_VARIANTS = [
        { key: 'maxresdefault', label: 'Max Resolution', minWidth: 1000, minHeight: 560 },
        { key: 'sddefault', label: 'High', minWidth: 600, minHeight: 450 },
        { key: 'hqdefault', label: 'Medium', minWidth: 450, minHeight: 300 },
        { key: 'mqdefault', label: 'Standard', minWidth: 300, minHeight: 160 },
        { key: 'default', label: 'Default', minWidth: 100, minHeight: 70 }
    ];

    // Helper to extract videos for copying
    const getFormattedVideoList = () => {
        return currentVideos.map(v => `${v.title}\n${v.url}\nDuration: ${v.duration || 'N/A'}`).join('\n\n');
    };

    const parseWatchPageInfo = (url) => {
        try {
            if (!url) return { isWatchPage: false, videoId: '', watchUrl: '' };

            const parsed = new URL(url);
            const videoId = parsed.searchParams.get('v') || '';
            const isWatchPage = parsed.hostname.includes('youtube.com') && parsed.pathname === '/watch' && !!videoId;

            return {
                isWatchPage,
                videoId,
                watchUrl: isWatchPage ? `${parsed.origin}${parsed.pathname}?v=${videoId}` : ''
            };
        } catch (e) {
            return { isWatchPage: false, videoId: '', watchUrl: '' };
        }
    };

    const buildThumbnailVariants = (videoId) => {
        return THUMBNAIL_VARIANTS.map((variant) => ({
            ...variant,
            url: `https://i.ytimg.com/vi/${videoId}/${variant.key}.jpg`,
            filename: `ytools-thumbnail-${videoId}-${variant.key}.jpg`
        }));
    };

    const probeThumbnailVariant = (variant) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const width = img.naturalWidth || img.width || 0;
                const height = img.naturalHeight || img.height || 0;
                const available = width >= variant.minWidth && height >= variant.minHeight;
                resolve({ ...variant, available, width, height });
            };
            img.onerror = () => {
                resolve({ ...variant, available: false, width: 0, height: 0 });
            };
            img.referrerPolicy = 'no-referrer';
            img.src = `${variant.url}?t=${Date.now()}`;
        });
    };

    const getAvailableThumbnails = async (videoId, forceReload = false) => {
        if (forceReload) {
            thumbnailCache.delete(videoId);
        }

        if (thumbnailCache.has(videoId)) {
            return thumbnailCache.get(videoId);
        }

        const promise = Promise.all(buildThumbnailVariants(videoId).map(probeThumbnailVariant))
            .then((results) => results.filter((item) => item.available));

        thumbnailCache.set(videoId, promise);
        return promise;
    };

    const downloadThumbnail = (variant) => {
        const fallbackDownload = () => {
            const link = document.createElement('a');
            link.href = variant.url;
            link.download = variant.filename;
            link.target = '_blank';
            link.rel = 'noreferrer';
            document.body.appendChild(link);
            link.click();
            link.remove();
        };

        if (chrome.downloads && typeof chrome.downloads.download === 'function') {
            chrome.downloads.download({
                url: variant.url,
                filename: variant.filename,
                saveAs: false
            }, () => {
                if (chrome.runtime.lastError) {
                    console.warn('YTools: Downloads API failed, using fallback download link.', chrome.runtime.lastError);
                    fallbackDownload();
                }
            });
            return;
        }

        fallbackDownload();
    };

    const showThumbnailWarning = (title, description) => {
        if (thumbnailWarningTitle) thumbnailWarningTitle.textContent = title;
        if (thumbnailWarningDesc) thumbnailWarningDesc.textContent = description;
        if (thumbnailWarning) thumbnailWarning.classList.remove('hidden');
        if (thumbnailDashboard) thumbnailDashboard.classList.add('hidden');
    };

    const renderThumbnailExtractor = async (url, isYouTubePage, forceReload = false) => {
        currentPageUrl = url || currentPageUrl || '';
        currentIsYouTubePage = !!isYouTubePage;

        if (!thumbnailList || !thumbnailCountText) return;

        const watchInfo = parseWatchPageInfo(currentPageUrl);
        const renderKey = currentIsYouTubePage
            ? (watchInfo.isWatchPage ? `watch:${watchInfo.videoId}` : 'youtube:non-watch')
            : 'not-youtube';

        if (!forceReload && renderKey === lastThumbnailRenderKey) {
            return;
        }

        lastThumbnailRenderKey = renderKey;
        const renderToken = ++thumbnailRenderToken;

        if (!currentIsYouTubePage) {
            thumbnailCountText.textContent = '0 variants';
            thumbnailList.classList.add('empty');
            thumbnailList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="bi bi-image"></i></div>
                    <div class="empty-title">No thumbnails yet!</div>
                    <div class="empty-desc">Open a YouTube watch page to extract the available thumbnail resolutions.</div>
                </div>
            `;
            showThumbnailWarning(
                'You are not on YouTube',
                'Thumbnail extraction only works on active YouTube watch pages.'
            );
            if (copyThumbnailPageBtn) copyThumbnailPageBtn.classList.add('hidden');
            return;
        }

        if (!watchInfo.isWatchPage) {
            thumbnailCountText.textContent = '0 variants';
            thumbnailList.classList.add('empty');
            thumbnailList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="bi bi-image"></i></div>
                    <div class="empty-title">Open a watch page</div>
                    <div class="empty-desc">Switch the active tab to a /watch?v=... page to load its thumbnail resolutions.</div>
                </div>
            `;
            showThumbnailWarning(
                'Open a YouTube Watch Page',
                'Thumbnail extraction only works on active YouTube watch pages that use the /watch?v=... URL format.'
            );
            if (copyThumbnailPageBtn) copyThumbnailPageBtn.classList.add('hidden');
            return;
        }

        if (thumbnailWarning) thumbnailWarning.classList.add('hidden');
        if (thumbnailDashboard) thumbnailDashboard.classList.remove('hidden');
        if (copyThumbnailPageBtn) copyThumbnailPageBtn.classList.remove('hidden');

        thumbnailCountText.textContent = 'Loading...';
        thumbnailList.classList.add('empty');
        thumbnailList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"><i class="bi bi-hourglass-split"></i></div>
                <div class="empty-title">Loading thumbnails...</div>
                <div class="empty-desc">Checking which thumbnail resolutions are actually available for this video.</div>
            </div>
        `;

        try {
            const thumbnails = await getAvailableThumbnails(watchInfo.videoId, forceReload);
            if (renderToken !== thumbnailRenderToken) return;

            if (!thumbnails.length) {
                thumbnailCountText.textContent = '0 variants';
                thumbnailList.classList.add('empty');
                thumbnailList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="bi bi-exclamation-circle"></i></div>
                        <div class="empty-title">No preview variants found</div>
                        <div class="empty-desc">YouTube did not expose any thumbnail resolutions for this video.</div>
                    </div>
                `;
                return;
            }

            thumbnailCountText.textContent = `${thumbnails.length} variant${thumbnails.length === 1 ? '' : 's'}`;
            thumbnailList.classList.remove('empty');
            thumbnailList.innerHTML = '';

            thumbnails.forEach((variant, index) => {
                const card = document.createElement('div');
                card.className = 'video-item thumbnail-item slide-up';
                card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;

                card.innerHTML = `
                    <div class="thumbnail-preview">
                        <img src="${variant.url}" alt="${variant.label} thumbnail preview" class="thumbnail-preview-image">
                        <span class="thumbnail-badge">${variant.label}</span>
                    </div>
                    <div class="video-info thumbnail-info">
                        <div class="video-title">${variant.label}</div>
                        <div class="video-meta thumbnail-meta">
                            <span class="video-index">#${index + 1}</span>
                            <span class="thumbnail-dimensions">${variant.width} x ${variant.height}</span>
                            <a href="${variant.url}" class="video-link-icon thumbnail-open-link" target="_blank" rel="noreferrer"><i class="bi bi-box-arrow-up-right"></i> Open</a>
                        </div>
                    </div>
                    <div class="video-card-right thumbnail-card-right">
                        <button class="btn-download-thumb" type="button">Download</button>
                    </div>
                `;

                const downloadBtn = card.querySelector('.btn-download-thumb');
                downloadBtn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    downloadThumbnail(variant);
                });

                const image = card.querySelector('.thumbnail-preview-image');
                image.addEventListener('click', () => {
                    window.open(variant.url, '_blank', 'noreferrer');
                });

                thumbnailList.appendChild(card);
            });
        } catch (error) {
            if (renderToken !== thumbnailRenderToken) return;

            console.error('YTools: Thumbnail extraction failed.', error);
            thumbnailCountText.textContent = '0 variants';
            thumbnailList.classList.add('empty');
            thumbnailList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
                    <div class="empty-title">Thumbnail lookup failed</div>
                    <div class="empty-desc">Please try refreshing the tab or reopen a valid watch page.</div>
                </div>
            `;
        }
    };

    const updateUI = (videos, isScanning, isYouTubePage, url) => {
        currentVideos = videos || [];
        isCurrentlyScanning = isScanning;
        currentPageUrl = url || currentPageUrl || '';
        currentIsYouTubePage = !!isYouTubePage;

        if (videoCountText) {
            videoCountText.textContent = `${currentVideos.length} item${currentVideos.length === 1 ? '' : 's'}`;
        }

        if (isScanning) {
            scanBtn.textContent = 'STOP SCANNING';
            scanBtn.classList.add('scanning');
            scanningIndicator.classList.remove('hidden');
        } else {
            scanBtn.textContent = 'START SCANNING';
            scanBtn.classList.remove('scanning');
            scanningIndicator.classList.add('hidden');
        }

        if (!isYouTubePage) {
            if (scannerDashboard) scannerDashboard.classList.add('hidden');
            if (channelWarning) channelWarning.classList.remove('hidden');
            videoList.innerHTML = '';
            copyBtn.classList.add('hidden');
            exportCsvBtn.classList.add('hidden');
            return;
        }

        if (scannerDashboard) scannerDashboard.classList.remove('hidden');
        if (channelWarning) channelWarning.classList.add('hidden');

        if (currentVideos.length === 0) {
            videoList.classList.add('empty');
            if (isScanning) {
                videoList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon"><i class="bi bi-hourglass-split"></i></div>
                        <div class="empty-title">Scanning...</div>
                        <div class="empty-desc">Extracting video titles, links, and durations. Please wait...!</div>
                    </div>
                `;
            } else {
                videoList.innerHTML = `
                    <div id="video-list" class="video-list empty">
                        <div class="empty-state">
                            <div class="empty-icon"><i class="bi bi-tv"></i></div>
                            <div class="empty-title">No videos!</div>
                            <div class="empty-desc">Go to a YouTube channel, playlist, or search page and click "Start Scanning".</div>
                        </div>
                    </div>
                `;
            }
            copyBtn.classList.add('hidden');
            exportCsvBtn.classList.add('hidden');
        } else {
            videoList.classList.remove('empty');
            videoList.innerHTML = '';
            currentVideos.forEach((video, index) => {
                const card = document.createElement('div');
                card.className = 'video-item slide-up';
                card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;
                
                card.innerHTML = `
                    <div class="video-info">
                        <div class="video-title">${video.title || 'Unknown Title'}</div>
                        <div class="video-meta">
                            <span class="video-index">#${index + 1}</span>
                            <a href="${video.url}" class="video-link-icon" target="_blank" title="${video.url}"><i class="bi bi-link-45deg"></i> Link</a>
                        </div>
                    </div>
                    <div class="video-card-right">
                        <span class="video-duration">${video.duration || '--:--'}</span>
                        <button class="btn-copy-card" data-url="${video.url}"><i class="bi bi-clipboard"></i></button>
                    </div>
                `;
                videoList.appendChild(card);

                const cardCopyBtn = card.querySelector('.btn-copy-card');
                cardCopyBtn.addEventListener('click', () => {
                    const textToCopy = `${video.title}\n${video.url}\nDuration: ${video.duration || 'N/A'}`;
                    navigator.clipboard.writeText(textToCopy).then(() => {
                        const originalText = cardCopyBtn.textContent;
                        cardCopyBtn.textContent = 'COPIED!';
                        cardCopyBtn.classList.add('copied');
                        setTimeout(() => {
                            cardCopyBtn.textContent = originalText;
                            cardCopyBtn.classList.remove('copied');
                        }, 1500);
                    });
                });
            });
            copyBtn.classList.remove('hidden');
            exportCsvBtn.classList.remove('hidden');
        }

        renderThumbnailExtractor(currentPageUrl, currentIsYouTubePage);
    };

    const requestStatus = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0] && tabs[0].url.includes('youtube.com')) {
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    files: ['content.js']
                }, () => {
                    chrome.runtime.lastError; // Clear error if any
                    setupPort(tabs[0].id);
                });
            } else {
                updateUI([], false, false, tabs[0]?.url);
                renderThumbnailExtractor(tabs[0]?.url || '', false);
            }
        });
    };

    const setupPort = (tabId) => {
        if (port) {
            port.disconnect();
        }
        
        try {
            port = chrome.tabs.connect(tabId, { name: 'ytools-connection' });
            
            port.onMessage.addListener((msg) => {
                updateUI(msg.videos, msg.isScanning, msg.isYouTubePage, msg.url);
            });

            port.onDisconnect.addListener(() => {
                port = null;
                console.log("Popup: Port disconnected.");
            });

            port.postMessage({ action: 'GET_STATUS' });
        } catch (e) {
            console.error("Popup: Failed to connect port.", e);
        }
    };

    scanBtn.addEventListener('click', () => {
        if (!port) return;
        if (isCurrentlyScanning) {
            port.postMessage({ action: 'STOP_SCANNING' });
        } else {
            port.postMessage({ 
                action: 'START_SCANNING',
                settings: {
                    autoScroll: document.getElementById('setting-autoscroll').checked,
                    ignoreShorts: document.getElementById('setting-ignore-shorts').checked,
                    scanSpeed: parseInt(document.getElementById('setting-speed').value, 10)
                }
            });
        }
    });

    clearBtn.addEventListener('click', () => {
        if (!port) return;
        port.postMessage({ action: 'CLEAR' });
        updateUI([], false, true, currentPageUrl);
    });

    copyBtn.addEventListener('click', () => {
        const text = getFormattedVideoList();
        navigator.clipboard.writeText(text).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = 'COPIED!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.textContent = originalText;
                copyBtn.classList.remove('copied');
            }, 2000);
        });
    });

    // Settings Dialog Logic
    const settingsBtn = document.getElementById('btn-settings');
    const closeSettingsBtn = document.getElementById('btn-close-settings');
    const settingsDialog = document.getElementById('settings-dialog');
    
    settingsBtn.addEventListener('click', () => {
        settingsDialog.classList.remove('hidden');
    });
    
    closeSettingsBtn.addEventListener('click', () => {
        settingsDialog.classList.add('hidden');
    });
    
    settingsDialog.addEventListener('click', (e) => {
        if (e.target === settingsDialog) {
            settingsDialog.classList.add('hidden');
        }
    });

    if (refreshThumbnailsBtn) {
        refreshThumbnailsBtn.addEventListener('click', () => {
            lastThumbnailRenderKey = '';
            renderThumbnailExtractor(currentPageUrl, currentIsYouTubePage, true);
        });
    }

    if (copyThumbnailPageBtn) {
        copyThumbnailPageBtn.addEventListener('click', () => {
            if (!currentPageUrl) return;

            navigator.clipboard.writeText(currentPageUrl).then(() => {
                const originalText = copyThumbnailPageBtn.textContent;
                copyThumbnailPageBtn.textContent = 'COPIED!';
                copyThumbnailPageBtn.classList.add('copied');
                setTimeout(() => {
                    copyThumbnailPageBtn.textContent = originalText;
                    copyThumbnailPageBtn.classList.remove('copied');
                }, 1500);
            });
        });
    }

    exportCsvBtn.addEventListener('click', () => {
        if (currentVideos.length === 0) return;
        
        // Escape CSV values
        const escapeCSV = (str) => {
            if (str === null || str === undefined) return '';
            return `"${String(str).replace(/"/g, '""')}"`;
        };

        const colConfig = [
            { id: 'col-videoId', name: 'Video ID', getVal: v => v.videoId || 'N/A' },
            { id: 'col-title', name: 'Title', getVal: v => v.title || '' },
            { id: 'col-channel', name: 'Channel', getVal: v => v.channel || 'Unknown' },
            { id: 'col-duration', name: 'Duration', getVal: v => v.duration || '--:--' },
            { id: 'col-views', name: 'Views', getVal: v => v.views || 'N/A' },
            { id: 'col-uploadDate', name: 'Upload Date', getVal: v => v.uploadDate || 'N/A' },
            { id: 'col-url', name: 'URL', getVal: v => v.url || '' },
            { id: 'col-thumbnailUrl', name: 'Thumbnail URL', getVal: v => v.thumbnailUrl || 'N/A' },
            { id: 'col-videoType', name: 'Video Type', getVal: v => v.videoType || 'Video' }
        ];

        const activeCols = colConfig.filter(col => document.getElementById(col.id).checked);
        
        // Fallback if user unchecks everything
        if (activeCols.length === 0) {
            alert('Please select at least one column to export.');
            return;
        }

        const headers = activeCols.map(col => col.name);
        const rows = currentVideos.map(v => activeCols.map(col => escapeCSV(col.getVal(v))));
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        let safeChannelName = 'unknown_channel';
        if (currentVideos.length > 0 && currentVideos[0].channel && currentVideos[0].channel !== 'Unknown Channel') {
            safeChannelName = currentVideos[0].channel.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        }
        const filename = `ytools_videos_${safeChannelName}_${timestamp}.csv`;
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        const originalText = exportCsvBtn.textContent;
        exportCsvBtn.textContent = 'EXPORTED!';
        exportCsvBtn.classList.add('copied');
        setTimeout(() => {
            exportCsvBtn.textContent = originalText;
            exportCsvBtn.classList.remove('copied');
        }, 1500);
    });

    // Tab switching logic
    const tabButtons = document.querySelectorAll('[data-tab]');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetContent = document.getElementById(`tab-${targetTab}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            if (targetTab === 'thumbnail') {
                renderThumbnailExtractor(currentPageUrl, currentIsYouTubePage);
            }
        });
    });

    // Settings Logic
    const settingAutoScroll = document.getElementById('setting-autoscroll');
    const settingIgnoreShorts = document.getElementById('setting-ignore-shorts');
    const settingSpeed = document.getElementById('setting-speed');
    const settingDarkMode = document.getElementById('setting-dark-mode');

    const applyDarkMode = () => {
        if (settingDarkMode.checked) {
            document.body.classList.remove('light-mode');
        } else {
            document.body.classList.add('light-mode');
        }
    };

    const saveSettings = () => {
        chrome.storage.local.set({
            autoScroll: settingAutoScroll.checked,
            ignoreShorts: settingIgnoreShorts.checked,
            scanSpeed: settingSpeed.value,
            darkMode: settingDarkMode.checked
        });
        applyDarkMode();
        
        if (port) {
            port.postMessage({
                action: 'UPDATE_SETTINGS',
                settings: {
                    autoScroll: settingAutoScroll.checked,
                    ignoreShorts: settingIgnoreShorts.checked,
                    scanSpeed: parseInt(settingSpeed.value, 10)
                }
            });
        }
    };

    chrome.storage.local.get(['autoScroll', 'ignoreShorts', 'scanSpeed', 'darkMode'], (res) => {
        if (res.autoScroll !== undefined) settingAutoScroll.checked = res.autoScroll;
        if (res.ignoreShorts !== undefined) settingIgnoreShorts.checked = res.ignoreShorts;
        if (res.scanSpeed !== undefined) settingSpeed.value = res.scanSpeed;
        if (res.darkMode !== undefined) {
            settingDarkMode.checked = res.darkMode;
        } else {
            settingDarkMode.checked = true;
        }
        applyDarkMode();
    });

    settingAutoScroll.addEventListener('change', saveSettings);
    settingIgnoreShorts.addEventListener('change', saveSettings);
    settingSpeed.addEventListener('change', saveSettings);
    settingDarkMode.addEventListener('change', saveSettings);

    // Initialize
    requestStatus();
});
