// content.js - Bruteforce Scraper, scroller, and dynamic state watcher for YouTube

if (!window.ytoolsLoaded) {
  window.ytoolsLoaded = true;

  console.log("YTools: Bruteforce content script loaded successfully.");

  let isScanning = false;
  let scannedVideos = [];
  let scanTimer = null;
  let lastScrollHeight = 0;
  let sameHeightCount = 0;

  let activePort = null;
  let watcherInterval = null;
  let lastVideoCount = 0;
  let clearedUrls = new Set();

  // Broad verification: simply check if we are on youtube.com
  const isYouTubePage = () => {
    return window.location.href.includes('youtube.com');
  };

  // Safe string conversion to prevent TypeErrors
  const safeString = (val) => {
    if (val === null || val === undefined) return '';
    return String(val);
  };

  // ====================================================================
  // ULTIMATE BRUTEFORCE EXTRACTOR
  // Abandons fragile DOM structure logic. Hunts for raw links and text.
  // ====================================================================
  const extractVideos = () => {
    const videoData = [];
    const urlGroups = new Map(); // Map of url -> array of anchor elements

    try {
      // 1. Gather EVERY link on the page
      const links = document.querySelectorAll('a[href]');
      links.forEach(a => {
        const href = a.getAttribute('href');
        if (!href) return;

        let isWatch = href.includes('/watch?v=');
        let isShort = href.includes('/shorts/');
        if (!isWatch && !isShort) return;

        try {
          const fullUrl = new URL(href, window.location.origin).href;
          const urlObj = new URL(fullUrl);
          let cleanedUrl = '';
          
          if (isWatch) {
            const videoId = urlObj.searchParams.get('v');
            if (videoId) {
              cleanedUrl = `${urlObj.origin}${urlObj.pathname}?v=${videoId}`;
            }
          } else if (isShort) {
            cleanedUrl = `${urlObj.origin}${urlObj.pathname}`;
          }

          if (cleanedUrl) {
            if (clearedUrls.has(cleanedUrl)) return;
            if (!urlGroups.has(cleanedUrl)) {
              urlGroups.set(cleanedUrl, []);
            }
            urlGroups.get(cleanedUrl).push(a);
          }
        } catch (e) {
          // Ignore URL parse errors
        }
      });

      const cleanAriaLabel = (ariaLabel) => {
        const cleaned = safeString(ariaLabel);
        if (!cleaned) return '';
        // Split by common language attribution words (by, de, von, par, por)
        const parts = cleaned.split(/\s(?:by|de|von|par|por)\s/i);
        if (parts.length > 1) {
          return parts[0].trim();
        }
        return cleaned.trim();
      };

      const isTimestamp = (str) => {
        return /^\s*\d{1,2}(:\d{2})+\s*$/.test(str);
      };

      // Global channel name fallback (only valid if we are on a channel page)
      let globalChannelName = '';
      const isChannelPage = window.location.pathname.startsWith('/@') || window.location.pathname.startsWith('/channel/') || window.location.pathname.startsWith('/user/') || window.location.pathname.startsWith('/c/');
      
      try {
        if (isChannelPage) {
          const globalChannelEl = document.querySelector('#page-header ytd-channel-name .yt-core-attributed-string, #page-header ytd-channel-name yt-formatted-string, #channel-name yt-formatted-string');
          if (globalChannelEl) globalChannelName = safeString(globalChannelEl.textContent).trim();
          if (!globalChannelName && document.title.includes('- YouTube')) {
            const titleMatch = document.title.match(/^(.*?)\s*-\s*YouTube$/);
            if (titleMatch) globalChannelName = titleMatch[1].trim();
          }
        }
      } catch (e) {}

      // 2. Process each URL group to intelligently deduce the best title, duration, and additional metadata
      urlGroups.forEach((anchors, url) => {
        let bestTitle = '';
        let duration = '';
        let channelName = '';
        let views = '';
        let uploadDate = '';
        let videoId = '';
        let ariaLabelFull = '';
        
        try {
          const urlObj = new URL(url);
          if (url.includes('/watch?v=')) {
            videoId = urlObj.searchParams.get('v') || '';
          } else if (url.includes('/shorts/')) {
            const parts = urlObj.pathname.split('/');
            videoId = parts[parts.indexOf('shorts') + 1] || '';
          }
        } catch (e) {
          // Ignore URL parsing errors
        }

        const candidates = new Set();
        let titleAttrCandidate = '';

        anchors.forEach(a => {
          // Harvest all possible text data from the anchor and its attributes
          const tText = safeString(a.textContent).replace(/\s+/g, ' ').trim();
          const tTitle = safeString(a.getAttribute('title')).replace(/\s+/g, ' ').trim();
          
          const rawAria = safeString(a.getAttribute('aria-label'));
          if (rawAria && rawAria.length > ariaLabelFull.length) {
            ariaLabelFull = rawAria; // Keep longest aria-label for regex extraction
          }

          const tAria = cleanAriaLabel(rawAria).replace(/\s+/g, ' ').trim();

          if (tText) candidates.add(tText);
          if (tTitle) {
            candidates.add(tTitle);
            if (!titleAttrCandidate) titleAttrCandidate = tTitle; // title attributes are highly reliable
          }
          if (tAria) candidates.add(tAria);

          // Harvest from internal nested elements (e.g. yt-formatted-string)
          const innerElements = a.querySelectorAll('*');
          innerElements.forEach(inner => {
            const iText = safeString(inner.textContent).replace(/\s+/g, ' ').trim();
            const iTitle = safeString(inner.getAttribute('title')).replace(/\s+/g, ' ').trim();
            if (iText) candidates.add(iText);
            if (iTitle) {
              candidates.add(iTitle);
              if (!titleAttrCandidate) titleAttrCandidate = iTitle;
            }
          });

          // Hunt for duration timestamps
          if (!duration) {
            if (isTimestamp(tText)) duration = tText;
            if (!duration) {
              for (const text of candidates) {
                if (isTimestamp(text)) {
                  duration = text;
                  break;
                }
              }
            }
          }

          // Hunt for container-specific metadata: Channel, Views, Upload Time
          const container = a.closest('ytd-rich-grid-media, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-video-renderer, ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer');
          if (container) {
            // Duration fallback
            if (!duration) {
              const timeOverlay = container.querySelector('ytd-thumbnail-overlay-time-status-renderer, span.ytd-thumbnail-overlay-time-status-renderer, badge-shape');
              if (timeOverlay) {
                const dt = safeString(timeOverlay.textContent).replace(/\s+/g, ' ').trim();
                if (isTimestamp(dt)) duration = dt;
              }
            }

            // Channel Name extraction
            if (!channelName) {
              const channelLinks = container.querySelectorAll('ytd-channel-name a, #channel-name a, a[href*="/@"], a[href*="/channel/"], a[href*="/user/"]');
              for (const link of channelLinks) {
                const txt = safeString(link.textContent).replace(/\s+/g, ' ').trim();
                // We ensure it has text, and avoid picking up single-character noise
                if (txt && txt.length > 1) {
                  channelName = txt;
                  break;
                }
              }
            }

            // Views & Upload Date extraction via innerText blocks
            if (!views || !uploadDate) {
              const metadataLine = container.querySelector('#metadata-line, ytd-video-meta-block');
              if (metadataLine) {
                const textContent = metadataLine.innerText || metadataLine.textContent || '';
                const parts = textContent.split(/[\n•]/).map(t => t.trim()).filter(Boolean);
                
                parts.forEach(txt => {
                  const lowerTxt = txt.toLowerCase();
                  if (lowerTxt.includes('view') || lowerTxt.includes('观看') || lowerTxt.includes('vista') || lowerTxt.includes('aufruf') || lowerTxt.includes('vue') || lowerTxt.includes('visualiza')) {
                    views = txt;
                  } else if (lowerTxt.includes('ago') || lowerTxt.includes('前') || lowerTxt.includes('hace') || lowerTxt.includes('vor') || lowerTxt.includes('il y a') || lowerTxt.includes('atrás') || lowerTxt.includes('streamed') || lowerTxt.includes('直播')) {
                    uploadDate = txt;
                  }
                });

                if (parts.length > 0 && !views) views = parts[0];
                if (parts.length > 1 && !uploadDate) uploadDate = parts[1];
              }
            }

            // Hyper-aggressive fallback: look at EVERY text node in the container
            if (!views || !uploadDate) {
              const allElements = Array.from(container.querySelectorAll('*'));
              for (const el of allElements) {
                // only check leaf nodes
                if (el.children.length === 0 && el.textContent) {
                  const txt = safeString(el.textContent).replace(/\s+/g, ' ').trim();
                  if (!txt) continue;
                  const lowerTxt = txt.toLowerCase();
                  
                  if (!views && /\d.*\s*(views?|vistas|aufrufe?|vues?|visualiza|观看)/i.test(lowerTxt)) {
                    views = txt;
                  }
                  if (!uploadDate && /\d.*\s*(ago|hace|vor|il y a|atrás|前)/i.test(lowerTxt)) {
                    uploadDate = txt;
                  }
                }
              }
            }
          }
        });

        // 2b. Ultimate Fallbacks
        if (!channelName) channelName = globalChannelName;

        if (!views && ariaLabelFull) {
          const viewMatch = ariaLabelFull.match(/(\d+(?:,\d+)*(?:\.\d+)?[KMBkmb]?\s*(?:views?|vistas|Aufrufe?|vues?|visualiza|观看))/i);
          if (viewMatch) views = viewMatch[1];
        }
        if (!uploadDate && ariaLabelFull) {
          const dateMatch = ariaLabelFull.match(/(\d+\s+(?:years?|months?|weeks?|days?|hours?|minutes?|seconds?)\s+(?:ago|hace|vor|il y a|atrás|前))/i);
          if (dateMatch) uploadDate = dateMatch[1];
        }

        // 3. Score and select the actual video title from the harvested strings
        const validCandidates = Array.from(candidates).filter(c => {
          if (!c || c.length < 2) return false;
          if (c.toLowerCase() === 'play all') return false;
          if (isTimestamp(c)) return false;
          return true;
        });

        if (validCandidates.length > 0) {
          if (titleAttrCandidate && validCandidates.includes(titleAttrCandidate)) {
            bestTitle = titleAttrCandidate;
          } else {
            // Sort by length, heavily penalizing strings that look like un-split aria metadata
            validCandidates.sort((a, b) => {
              const aPenalty = (a.includes(' views') || a.includes(' ago')) ? 1000 : 0;
              const bPenalty = (b.includes(' views') || b.includes(' ago')) ? 1000 : 0;
              const aScore = a.length - aPenalty;
              const bScore = b.length - bPenalty;
              return bScore - aScore; // Descending order
            });
            bestTitle = validCandidates[0];
          }
        }

        if (bestTitle) {
          videoData.push({
            title: bestTitle,
            url: url,
            duration: duration || '--:--',
            videoId: videoId || 'N/A',
            channel: channelName || 'Unknown Channel',
            views: views || 'N/A',
            uploadDate: uploadDate || 'N/A'
          });
        }
      });

    } catch (err) {
      console.error("YTools: Bruteforce Scraper error occurred:", err);
    }

    console.log(`YTools: Bruteforce extracted ${videoData.length} unique videos from the page DOM.`);
    return videoData;
  };

  // Scroll down to load more videos
  const scanLoop = () => {
    if (!isScanning) return;

    console.log("YTools: Triggering page scroll...");
    window.scrollTo(0, document.documentElement.scrollHeight);
    window.scrollBy(0, 5000);

    if (document.scrollingElement) {
      document.scrollingElement.scrollTop = document.scrollingElement.scrollHeight;
    }

    window.dispatchEvent(new Event('scroll'));

    scanTimer = setTimeout(() => {
      if (!isContextValid()) {
        isScanning = false;
        return;
      }

      scannedVideos = extractVideos();
      const currentScrollHeight = document.documentElement.scrollHeight;
      
      console.log(`YTools: Scroll height is ${currentScrollHeight} (previous was ${lastScrollHeight}).`);
      
      if (currentScrollHeight === lastScrollHeight) {
        sameHeightCount++;
        console.log(`YTools: Scroll height unchanged. Attempt ${sameHeightCount}/6.`);
      } else {
        sameHeightCount = 0;
        lastScrollHeight = currentScrollHeight;
      }

      if (sameHeightCount >= 6) {
        isScanning = false;
        console.log("YTools: Reached bottom of page. Scanning completed.");
        notifyPopup({ type: 'SCAN_COMPLETE', videos: scannedVideos });
      } else {
        notifyPopup({ type: 'SCAN_UPDATE', videos: scannedVideos });
        scanLoop();
      }
    }, 1200);
  };

  const startScanning = () => {
    if (isScanning) return;
    isScanning = true;
    console.log("YTools: Start scanning initiated.");
    scannedVideos = extractVideos();
    lastScrollHeight = document.documentElement.scrollHeight;
    sameHeightCount = 0;
    
    notifyPopup({ type: 'SCAN_STARTED', videos: scannedVideos });
    scanLoop();
  };

  const stopScanning = () => {
    if (!isScanning) return;
    isScanning = false;
    console.log("YTools: Scanning stopped by user.");
    if (scanTimer) clearTimeout(scanTimer);
    scannedVideos = extractVideos();
    notifyPopup({ type: 'SCAN_STOPPED', videos: scannedVideos });
  };

  const clearData = () => {
    isScanning = false;
    console.log("YTools: State reset cleared.");
    if (scanTimer) clearTimeout(scanTimer);
    
    const currentVideos = extractVideos();
    currentVideos.forEach(v => clearedUrls.add(v.url));
    if (scannedVideos) {
      scannedVideos.forEach(v => clearedUrls.add(v.url));
    }
    
    scannedVideos = [];
    lastVideoCount = 0;
    notifyPopup({ type: 'SCAN_STOPPED', videos: [] });
  };

  // Helper to check if extension context is still valid
  const isContextValid = () => {
    try {
      return typeof chrome !== 'undefined' && chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  };

  const notifyPopup = (message) => {
    if (!isContextValid()) {
      isScanning = false;
      return;
    }

    if (activePort) {
      try {
        activePort.postMessage({
          type: message.type,
          isScanning: isScanning,
          videos: message.videos,
          isYouTubePage: isYouTubePage(),
          url: window.location.href
        });
        return;
      } catch (e) {
        activePort = null;
      }
    }

    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message).catch(() => {});
      }
    } catch (e) {
      // Extension context invalidated
      isScanning = false;
    }
  };

  // Port connection handler (triggered when popup opens)
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'ytools-connection') {
      activePort = port;
      console.log("YTools: Active port connection established with popup.");

      port.onMessage.addListener((request) => {
        const isYT = isYouTubePage();
        console.log(`YTools: Received port request: ${request.action}. Valid YouTube page: ${isYT}`);
        
        if (request.action === 'GET_STATUS') {
          const currentVideos = extractVideos();
          if (!isScanning && currentVideos.length > 0) {
            scannedVideos = currentVideos;
          }
          port.postMessage({
            type: 'STATUS_UPDATE',
            isScanning: isScanning,
            videos: scannedVideos.length > 0 ? scannedVideos : currentVideos,
            isYouTubePage: isYT,
            url: window.location.href
          });
        } else if (request.action === 'START_SCANNING') {
          if (isYT) startScanning();
        } else if (request.action === 'STOP_SCANNING') {
          stopScanning();
        } else if (request.action === 'CLEAR') {
          clearData();
        }
      });

      lastVideoCount = extractVideos().length;
      watcherInterval = setInterval(() => {
        if (!isContextValid()) {
          clearInterval(watcherInterval);
          watcherInterval = null;
          return;
        }

        const currentVideos = extractVideos();
        if (currentVideos.length !== lastVideoCount || isScanning) {
          lastVideoCount = currentVideos.length;
          if (!isScanning) {
            scannedVideos = currentVideos;
          }
          port.postMessage({
            type: 'STATUS_UPDATE',
            isScanning: isScanning,
            videos: scannedVideos.length > 0 ? scannedVideos : currentVideos,
            isYouTubePage: isYouTubePage(),
            url: window.location.href
          });
        }
      }, 800);

      port.onDisconnect.addListener(() => {
        activePort = null;
        console.log("YTools: Port disconnected.");
        if (watcherInterval) {
          clearInterval(watcherInterval);
          watcherInterval = null;
        }
      });
    }
  });

  // Fallback message listener for simple initialization checks
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const isYT = isYouTubePage();
    
    if (request.action === 'GET_STATUS') {
      const currentVideos = extractVideos();
      if (!isScanning && currentVideos.length > 0) {
        scannedVideos = currentVideos;
      }
      sendResponse({
        isScanning: isScanning,
        videos: scannedVideos.length > 0 ? scannedVideos : currentVideos,
        isYouTubePage: isYT,
        url: window.location.href
      });
    }
    return true;
  });
}
