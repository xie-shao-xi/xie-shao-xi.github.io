export const downBigFile = async (url, options = {}, ) => {
  // 创建下载器实例
  const downloader = new RetryConcurrentDownloader(url,
    {
      chunkSize: 2 * 1024 * 1024, // 2MB分块
      maxConcurrent: 4,           // 4个并发
      maxRetries: 3,              // 每个分块重试3次
      retryDelay: 1000,           // 1秒重试延迟
      timeout: 30000,              // 30秒超时
      ...options
  });
  return new Promise((resolve, reject) => {
    // 开始下载
    downloader.start(
      resolve, reject,
      // 进度回调
      options?.onProgress,
      // (loaded, total, stats) => {
      //   options?.onProgress?.(loaded, total, stats);
      //   console.log(`进度: ${stats.progress}% | 速度: ${stats.averageSpeed} MB/s`);
      // },
      // 分块完成回调
      // (chunkIndex, totalChunks) => {
      //   console.log(`分块 ${chunkIndex + 1}/${totalChunks} 完成`);
      // }
    );
  });

  // 暂停下载
  // downloader.pause();

  // 恢复下载
  // downloader.resume();

  // 停止下载
  // downloader.stop();

}

class RetryConcurrentDownloader {
  constructor(url, options = {}) {
    this.url = url;
    this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB分块
    this.maxConcurrent = options.maxConcurrent || 3; // 最大并发数
    this.maxRetries = options.maxRetries || 3; // 每个分块最大重试次数
    this.retryDelay = options.retryDelay || 1000; // 重试延迟(ms)
    this.timeout = options.timeout || 30000; // 单个请求超时时间
    this.blobType = options.blobType || "";

    this.totalSize = 0;
    this.downloadedSize = 0;
    this.chunks = [];
    this.results = [];
    this.isPaused = false;
    this.isStopped = false;
    this.activeDownloads = new Map();
    this.controllers = new Map();

    // 统计信息
    this.stats = {
      totalChunks: 0,
      completedChunks: 0,
      failedChunks: 0,
      retryCount: 0,
      startTime: 0,
      averageSpeed: 0
    };
  }

  /**
   * 开始下载
   * @param {function} onProgress 进度回调 (loaded, total, stats)
   * @param {function} onChunkComplete 分块完成回调 (chunkIndex, totalChunks)
   */
  async start(finishCallback = null, errorCallback = null, onProgress = null, onChunkComplete = null) {
    try {
      this.stats.startTime = Date.now();
      this.isStopped = false;

      await this.initialize();
      await this.downloadAllChunks(onProgress, onChunkComplete);

      if (!this.isStopped) {
        let bolb = await this.mergeAndDownload();
        finishCallback && finishCallback(bolb);
        console.log('🎉 下载完成！');
      }

    } catch (error) {
      console.error('下载失败:', error);
      errorCallback && errorCallback(error?.message ?? JSON.stringify(error));
    }
  }

  /**
   * 初始化文件信息和分块
   */
  async initialize() {
    if (this.totalSize > 0) return;

    console.log('🔍 获取文件信息...');
    const response = await fetch(this.url, { method: 'HEAD' });
    this.totalSize = parseInt(response.headers.get('Content-Length') || '0');
    this.blobType = response.headers.get('content-type') ?? this.blobType;

    if (!this.totalSize) {
      throw new Error('服务器不支持 Range 请求或无法获取文件大小');
    }

    // 检查服务器是否支持分块下载
    const acceptRanges = response.headers.get('Accept-Ranges');
    if (acceptRanges !== 'bytes') {
      console.warn('⚠️ 服务器可能不支持分块下载');
    }

    // 初始化分块信息
    const totalChunks = Math.ceil(this.totalSize / this.chunkSize);
    this.chunks = Array.from({ length: totalChunks }, (_, i) => ({
      index: i,
      start: i * this.chunkSize,
      end: Math.min((i + 1) * this.chunkSize - 1, this.totalSize - 1),
      retries: 0,
      completed: false,
      failed: false
    }));

    this.results = new Array(totalChunks);
    this.stats.totalChunks = totalChunks;

    console.log(`📁 文件大小: ${(this.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`📦 分块数量: ${totalChunks} (每块 ${this.chunkSize / 1024} KB)`);
  }

  /**
   * 下载所有分块（带并发控制和重试机制）
   */
  async downloadAllChunks(onProgress, onChunkComplete) {
    const pendingChunks = this.chunks.filter(chunk => !chunk.completed && !chunk.failed);

    // 创建下载队列
    const downloadQueue = [...pendingChunks];
    const activeDownloads = new Set();

    while (downloadQueue.length > 0 && !this.isStopped) {
      if (this.isPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // 控制并发数
      if (activeDownloads.size >= this.maxConcurrent) {
        await Promise.race(Array.from(activeDownloads));
        continue;
      }

      const chunk = downloadQueue.shift();
      if (!chunk) continue;

      const downloadPromise = this.downloadChunkWithRetry(chunk, onProgress)
        .then((result) => {
          if (result.success) {
            chunk.completed = true;
            this.stats.completedChunks++;

            if (onChunkComplete) {
              onChunkComplete(chunk.index, this.stats.totalChunks);
            }

            // console.log(`✅ 分块 ${chunk.index + 1}/${this.stats.totalChunks} 下载完成`);
          } else {
            chunk.failed = true;
            this.stats.failedChunks++;
            console.error(`❌ 分块 ${chunk.index} 下载失败`);

            // 将失败的分块重新加入队列（如果还有重试次数）
            if (chunk.retries < this.maxRetries) {
              downloadQueue.push(chunk);
            }else {
              throw new Error(result.reason);
            }
          }
        })
        .finally(() => {
          activeDownloads.delete(downloadPromise);
          this.controllers.delete(chunk.index);
        });

      activeDownloads.add(downloadPromise);
    }

    // 等待所有进行中的下载完成
    await Promise.all(Array.from(activeDownloads));

    // 检查是否有失败的分块
    const failedChunks = this.chunks.filter(chunk => chunk.failed);
    if (failedChunks.length > 0 && !this.isStopped) {
      throw new Error(`${failedChunks.length} 个分块下载失败`);
    }
  }

  /**
   * 带重试机制的分块下载
   */
  async downloadChunkWithRetry(chunk, onProgress) {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (this.isStopped || this.isPaused) {
        return { success: false, reason: 'stopped' };
      }

      try {
        const controller = new AbortController();
        this.controllers.set(chunk.index, controller);

        // 设置超时
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.timeout);

        const response = await fetch(this.url, {
          headers: { 'Range': `bytes=${chunk.start}-${chunk.end}` },
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (response?.status === 206 || (this.chunks.length == 1 && response?.status === 200)) { // Partial Content
          const chunkBuffer = await response.arrayBuffer();
          this.results[chunk.index] = chunkBuffer;
          this.downloadedSize += chunkBuffer.byteLength;

          // 更新统计信息
          this.updateStats();

          // 调用进度回调
          if (onProgress) {
            onProgress(this.downloadedSize, this.totalSize, this.getStats());
          }

          return { success: true, data: chunkBuffer };
        } else {
          throw new Error(response ? `请求异常：${response?.status}: ${response?.statusText}` : "");
        }

      } catch (error) {
        chunk.retries = attempt + 1;
        this.stats.retryCount++;

        if (attempt < this.maxRetries) {
          console.warn(`⚠️ 分块 ${chunk.index} 第 ${attempt + 1} 次尝试失败，${this.retryDelay}ms后重试:`, error.message);

          // 指数退避延迟
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`💥 分块 ${chunk.index} 重试 ${this.maxRetries} 次后失败:`, error.message);
          return { success: false, reason: error.message };
        }
      }
    }

    return { success: false, reason: 'max retries exceeded' };
  }

  /**
   * 更新统计信息
   */
  updateStats() {
    const elapsedTime = (Date.now() - this.stats.startTime) / 1000; // 秒
    if (elapsedTime > 0) {
      this.stats.averageSpeed = this.downloadedSize / elapsedTime / 1024 / 1024; // MB/s
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      progress: (this.downloadedSize / this.totalSize * 100).toFixed(1),
      downloadedMB: (this.downloadedSize / 1024 / 1024).toFixed(2),
      totalMB: (this.totalSize / 1024 / 1024).toFixed(2),
      averageSpeed: this.stats.averageSpeed.toFixed(2)
    };
  }

  /**
   * 合并分块并触发下载
   */
  async mergeAndDownload() {
    console.log('🔗 开始合并分块...');

    const fullBuffer = new Uint8Array(this.totalSize);
    let offset = 0;

    for (let i = 0; i < this.results.length; i++) {
      const chunkBuffer = this.results[i];
      if (chunkBuffer) {
        fullBuffer.set(new Uint8Array(chunkBuffer), offset);
        offset += chunkBuffer.byteLength;
      }
    }

    // 触发下载
    const blob = new Blob([fullBuffer], { type: this.blobType });
    return blob;
  }


  /**
   * 暂停下载
   */
  pause() {
    this.isPaused = true;
    // 中止所有进行中的请求
    for (const [chunkIndex, controller] of this.controllers) {
      controller.abort();
      console.log(`⏸️ 暂停分块 ${chunkIndex} 的下载`);
    }
    this.controllers.clear();
    this.activeDownloads.clear();
  }

  /**
   * 恢复下载
   */
  async resume() {
    if (this.isPaused) {
      console.log('▶️ 恢复下载');
      this.isPaused = false;
      await this.start();
    }
  }

  /**
   * 停止下载（完全停止）
   */
  stop() {
    this.isStopped = true;
    this.pause();
    console.log('⏹️ 下载已停止');
  }
}
