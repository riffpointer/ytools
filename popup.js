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

    let currentVideos = [];
    let isCurrentlyScanning = false;
    let port = null;

    // Helper to extract videos for copying
    const getFormattedVideoList = () => {
        return currentVideos.map(v => `${v.title}\n${v.url}\nDuration: ${v.duration || 'N/A'}`).join('\n\n');
    };

    const updateUI = (videos, isScanning, isYouTubePage, url) => {
        currentVideos = videos || [];
        isCurrentlyScanning = isScanning;

        if (videoCountText) {
            videoCountText.textContent = `${currentVideos.length} VIDEO${currentVideos.length === 1 ? '' : 'S'}`;
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
            statusContainer.style.display = 'none';
            channelWarning.style.display = 'flex';
            videoList.innerHTML = '';
            copyBtn.classList.add('hidden');
            exportCsvBtn.classList.add('hidden');
            return;
        }

        statusContainer.style.display = 'flex';
        channelWarning.style.display = 'none';

        if (currentVideos.length === 0) {
            videoList.classList.add('empty');
            if (isScanning) {
                videoList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">⏳</div>
                        <div class="empty-title">SCANNING PAGE</div>
                        <div class="empty-desc">Extracting video titles, links, and durations. Please wait...</div>
                    </div>
                `;
            } else {
                videoList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📺</div>
                        <div class="empty-title">NO VIDEOS FOUND</div>
                        <div class="empty-desc">Navigate to a YouTube channel, playlist, or search page and click "START SCANNING".</div>
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
                            <a href="${video.url}" class="video-link-icon" target="_blank" title="${video.url}">&#128279; Link</a>
                        </div>
                    </div>
                    <div class="video-card-right">
                        <span class="video-duration">${video.duration || '--:--'}</span>
                        <button class="btn-copy-card" data-url="${video.url}">COPY</button>
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
            port.postMessage({ action: 'START_SCANNING' });
        }
    });

    clearBtn.addEventListener('click', () => {
        if (!port) return;
        port.postMessage({ action: 'CLEAR' });
        updateUI([], false, true, window.location.href);
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

    exportCsvBtn.addEventListener('click', () => {
        if (currentVideos.length === 0) return;
        
        // Escape CSV values
        const escapeCSV = (str) => {
            if (str === null || str === undefined) return '';
            return `"${String(str).replace(/"/g, '""')}"`;
        };

        const headers = ['Video ID', 'Title', 'Channel', 'Duration', 'Views', 'Upload Date', 'URL'];
        const rows = currentVideos.map(v => [
            escapeCSV(v.videoId || 'N/A'),
            escapeCSV(v.title || ''),
            escapeCSV(v.channel || 'Unknown'),
            escapeCSV(v.duration || '--:--'),
            escapeCSV(v.views || 'N/A'),
            escapeCSV(v.uploadDate || 'N/A'),
            escapeCSV(v.url || '')
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'ytools_videos.csv');
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

    // Initialize
    requestStatus();
});
