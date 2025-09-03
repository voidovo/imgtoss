// 更新器 API 测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdaterAPI, UpdateStage, UpdaterErrorType } from '../updater-api';

// Mock Tauri 插件
vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

vi.mock('../tauri-api', () => ({
  tauriAPI: {
    getAppVersion: vi.fn(),
  },
}));

describe('UpdaterAPI', () => {
  let updaterAPI: UpdaterAPI;

  beforeEach(() => {
    updaterAPI = new UpdaterAPI();
    vi.clearAllMocks();
  });

  describe('getCurrentVersion', () => {
    it('应该返回当前应用版本', async () => {
      const mockVersion = '1.0.0';
      const { tauriAPI } = await import('../tauri-api');
      vi.mocked(tauriAPI.getAppVersion).mockResolvedValue(mockVersion);

      const version = await updaterAPI.getCurrentVersion();
      expect(version).toBe(mockVersion);
      expect(tauriAPI.getAppVersion).toHaveBeenCalledOnce();
    });

    it('应该在获取版本失败时抛出错误', async () => {
      const { tauriAPI } = await import('../tauri-api');
      vi.mocked(tauriAPI.getAppVersion).mockRejectedValue(new Error('获取版本失败'));

      await expect(updaterAPI.getCurrentVersion()).rejects.toMatchObject({
        type: UpdaterErrorType.Unknown,
        message: '获取应用版本失败',
      });
    });
  });

  describe('checkForUpdates', () => {
    it('应该在有更新时返回更新信息', async () => {
      const mockVersion = '1.0.0';
      const mockUpdate = {
        version: '1.1.0',
        date: '2024-01-01',
        body: '新版本发布',
        contentLength: 1024000,
      };

      const { tauriAPI } = await import('../tauri-api');
      const { check } = await import('@tauri-apps/plugin-updater');
      
      vi.mocked(tauriAPI.getAppVersion).mockResolvedValue(mockVersion);
      vi.mocked(check).mockResolvedValue(mockUpdate);

      const progressCallback = vi.fn();
      updaterAPI.onProgress(progressCallback);

      const updateInfo = await updaterAPI.checkForUpdates();

      expect(updateInfo).toEqual({
        currentVersion: mockVersion,
        available: true,
        version: mockUpdate.version,
        date: mockUpdate.date,
        body: mockUpdate.body,
      });

      // 验证进度回调被调用
      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: UpdateStage.Checking,
          progress: 0,
          message: '正在检查更新...',
        })
      );

      expect(progressCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: UpdateStage.Idle,
          progress: 100,
          message: `发现新版本 ${mockUpdate.version}`,
        })
      );
    });

    it('应该在没有更新时返回相应信息', async () => {
      const mockVersion = '1.0.0';

      const { tauriAPI } = await import('../tauri-api');
      const { check } = await import('@tauri-apps/plugin-updater');
      
      vi.mocked(tauriAPI.getAppVersion).mockResolvedValue(mockVersion);
      vi.mocked(check).mockResolvedValue(null);

      const updateInfo = await updaterAPI.checkForUpdates();

      expect(updateInfo).toEqual({
        currentVersion: mockVersion,
        available: false,
      });
    });

    it('应该在检查更新失败时抛出错误', async () => {
      const { tauriAPI } = await import('../tauri-api');
      const { check } = await import('@tauri-apps/plugin-updater');
      
      vi.mocked(tauriAPI.getAppVersion).mockResolvedValue('1.0.0');
      vi.mocked(check).mockRejectedValue(new Error('网络错误'));

      await expect(updaterAPI.checkForUpdates()).rejects.toMatchObject({
        type: UpdaterErrorType.CheckFailed,
        message: '检查更新失败',
      });
    });
  });

  describe('进度监听', () => {
    it('应该正确添加和移除进度监听器', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsubscribe1 = updaterAPI.onProgress(callback1);
      const unsubscribe2 = updaterAPI.onProgress(callback2);

      // 模拟进度通知
      updaterAPI['notifyProgress']({
        stage: UpdateStage.Checking,
        progress: 50,
        message: '测试消息',
      });

      expect(callback1).toHaveBeenCalledOnce();
      expect(callback2).toHaveBeenCalledOnce();

      // 移除第一个监听器
      unsubscribe1();

      updaterAPI['notifyProgress']({
        stage: UpdateStage.Downloading,
        progress: 75,
        message: '另一个测试消息',
      });

      expect(callback1).toHaveBeenCalledOnce(); // 不应该再被调用
      expect(callback2).toHaveBeenCalledTimes(2); // 应该被调用两次
    });
  });

  describe('状态管理', () => {
    it('应该正确跟踪更新状态', () => {
      expect(updaterAPI.isUpdateInProgress()).toBe(false);
      expect(updaterAPI.getCurrentUpdate()).toBeNull();
    });

    it('应该正确清除当前更新', () => {
      // 设置一个模拟的更新对象
      updaterAPI['currentUpdate'] = {
        version: '1.1.0',
        date: '2024-01-01',
        body: '测试更新',
        contentLength: 1024,
        downloadAndInstall: vi.fn(),
      };

      expect(updaterAPI.getCurrentUpdate()).not.toBeNull();

      updaterAPI.clearCurrentUpdate();
      expect(updaterAPI.getCurrentUpdate()).toBeNull();
    });
  });

  describe('错误处理', () => {
    it('应该创建正确的错误对象', () => {
      const error = updaterAPI['createError'](
        UpdaterErrorType.Network,
        '网络连接失败',
        '详细错误信息'
      );

      expect(error).toEqual({
        type: UpdaterErrorType.Network,
        message: '网络连接失败',
        details: '详细错误信息',
        recoverable: true,
      });
    });

    it('应该正确标识可恢复的错误', () => {
      const networkError = updaterAPI['createError'](
        UpdaterErrorType.Network,
        '网络错误'
      );
      expect(networkError.recoverable).toBe(true);

      const permissionError = updaterAPI['createError'](
        UpdaterErrorType.Permission,
        '权限错误'
      );
      expect(permissionError.recoverable).toBe(false);
    });
  });
});