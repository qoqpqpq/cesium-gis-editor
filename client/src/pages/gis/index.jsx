// GIS 三维地球页面（Sandcastle 风格）
// 三列布局：代码编辑器 | Cesium 地球 | AI 助手
// - 列宽可拖拽调节（左右两个垂直分割条）
// - 每列可折叠/展开（点击折叠按钮收起为窄条）
import * as Cesium from 'cesium';
import CesiumEarth from './CesiumEarth.jsx';
import AiSidePanel from './AiSidePanel.jsx';
import AiStatusBanner from './AiStatusBanner.jsx';
import CodeEditor from './CodeEditor.jsx';
import FileLoader from './FileLoader.jsx';
import EditorPanel from './editor/EditorPanel.jsx';
import ImageryTokenDialog from './ImageryTokenDialog.jsx';
import WriteToolConfirmModal from './WriteToolConfirmModal.jsx';
import ErrorBoundary from '../../components/ErrorBoundary.jsx';
import EditorErrorFallback from '../../components/EditorErrorFallback.jsx';
import AiKeySettings from '../../components/AiKeySettings.jsx';
import { colClass, CollapseBar, HSplitter, ToastStack, AiSceneDescBanner } from './GisLayoutBits.jsx';
import { useGisPage } from './useGisPage.js';

export default function GIS() {
  const page = useGisPage();
  const {
    cesiumRef,
    editorRef,
    ctxRef,
    containerRef,
    sandboxToastShownRef,
    coordFormat,
    setCoordFormat,
    toasts,
    setToasts,
    toastIdRef,
    aiMessages,
    setAiMessages,
    aiStreaming,
    setAiStreaming,
    aiAbortRef,
    aiXhrRef,
    pendingViewStateRef,
    writeConfirm,
    setWriteConfirm,
    writeConfirmResolveRef,
    confirmWrite,
    lastError,
    setLastError,
    aiPlatforms,
    setAiPlatforms,
    keySettingsOpen,
    setKeySettingsOpen,
    aiCurrentPlatform,
    setAiCurrentPlatform,
    aiSessionId,
    aiSceneDesc,
    setAiSceneDesc,
    editorCode,
    setEditorCode,
    loadedFiles,
    setLoadedFiles,
    sceneContext,
    setSceneContext,
    sceneContextRefreshRef,
    showTokenDialog,
    setShowTokenDialog,
    tdtTokenOverride,
    setTdtTokenOverride,
    cesiumTokenOverride,
    setCesiumTokenOverride,
    calcThird,
    leftW,
    setLeftW,
    rightW,
    setRightW,
    leftCollapsed,
    setLeftCollapsed,
    rightCollapsed,
    setRightCollapsed,
    startDrag,
    pushToast,
    captureCtx,
    runSandboxCode,
    clearLastError,
    handleResetScene,
    handleClearScene,
    handleConsoleLog,
    handleApplyCode,
    captureSceneContext,
    handleAiSend,
    handleStop,
    actualLeftW,
    actualRightW,
  } = page;
  return (
    <div
      className={
        'gis-container'
        + (leftCollapsed ? ' left-collapsed' : '')
        + (rightCollapsed ? ' right-collapsed' : '')
      }
      ref={containerRef}
      style={{ '--left-w': actualLeftW + 'px', '--right-w': actualRightW + 'px' }}
    >
      {/* 阶段 3B：场景 AI 说明横幅（打开分享链接时显示） */}
      {aiSceneDesc && (
        <AiSceneDescBanner desc={aiSceneDesc} onClose={() => setAiSceneDesc(null)} />
      )}

      {/* ===== 左列：代码编辑器 + 控制台 ===== */}
      <div className={colClass('left', leftCollapsed)}>
        {leftCollapsed ? (
          <CollapseBar icon={'<'} label="代码" title="展开代码编辑器" onClick={() => setLeftCollapsed(false)} />
        ) : (
          <CodeEditor
            ctxRef={ctxRef}
            editorRef={editorRef}
            onApply={() => {}}
            onConsoleLog={handleConsoleLog}
            onCollapse={() => setLeftCollapsed(true)}
            // onAskAI / onSendLogToAI：CodeEditor 内部通过 window 'ai-set-input' 事件
            //   直接把 prompt 填到 AiSidePanel 输入框（不直接发送），用户可修改后再点"发送"
          />
        )}
      </div>

      {/* 垂直分割条 1（左|中）— 始终渲染；折叠时由 CSS 把该轨道收缩为 0 */}
      <HSplitter collapsed={leftCollapsed} onMouseDown={startDrag('left')} title="拖拽调节宽度" />

      {/* ===== 中列：Cesium 地球 ===== */}
      <div className={colClass('center', false)}>
        <div className="gis-scene">
          <CesiumEarth
            ref={cesiumRef}
            coordFormat={coordFormat}
            onCoordFormatChange={setCoordFormat}
            tdtTokenOverride={tdtTokenOverride}
            cesiumTokenOverride={cesiumTokenOverride}
            editorApiRef={editorRef}
            onInfo={(t) => {
              captureCtx();
              pushToast(t, 'info', 2200);
            }}
            onError={(err) => {
              pushToast('Cesium 初始化失败:' + err.message, 'error', 6000);
            }}
          />

          {/* 阶段 2C: 分享当前视图按钮(浮在右下角,避开 Cesium 自带控件) */}
          <button
            type="button"
            className="gis-share-view-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('gis-share-view'))}
            title="把当前地图视图打包成可分享 URL"
          >
            🔗 分享视图
          </button>

          {/* 天地图 Token 配置弹窗 */}
          {showTokenDialog && (
            <ImageryTokenDialog
              hasOverride={!!tdtTokenOverride || !!cesiumTokenOverride}
              onSave={({ tdtToken, cesiumToken }) => {
                // 仅在内存中暂存（不会写入 localStorage / sessionStorage），刷新/关闭即清
                setTdtTokenOverride(tdtToken);
                setCesiumTokenOverride(cesiumToken);
                setShowTokenDialog(false);
                try { cesiumRef.current?.reloadImagery?.(); } catch (_) {}
              }}
              onSkip={() => {
                localStorage.setItem('cesium_tdt_skipped', '1');
                setShowTokenDialog(false);
              }}
            />
          )}

          <ToastStack toasts={toasts} />

          {/* 文件上传面板（左下，避开 Cesium 自带控件） */}
          <FileLoader
            api={cesiumRef.current}
            loadedFiles={loadedFiles}
            onAdd={(f) => {
              setLoadedFiles((arr) => [...arr, f]);
              pushToast(`已加载 ${f.name}`, 'success', 1500);
            }}
            onRemove={(id) => {
              try { cesiumRef.current?.removeDataSource?.(id); } catch (_) {}
              setLoadedFiles((arr) => arr.filter((f) => f.id !== id));
              pushToast('已移除', 'info', 1200);
            }}
            onToggle={(id, willShow) => {
              try { cesiumRef.current?.toggleDataSource?.(id, willShow); } catch (_) {}
              setLoadedFiles((arr) => arr.map((f) => f.id === id ? { ...f, visible: willShow } : f));
            }}
            onZoom={(id) => {
              try { cesiumRef.current?.zoomToDataSource?.(id); } catch (_) {}
            }}
            onError={(msg) => pushToast(msg, 'error', 3500)}
          />

          {/* GIS 编辑器面板（点/线/面绘制、编辑、样式、保存下载）
              - ErrorBoundary 包一层：编辑器内部 render 抛错时只挂编辑器，
                不影响 Cesium 地球 / AI 助手 / 代码编辑器
          */}
          <ErrorBoundary fallback={EditorErrorFallback}>
            <EditorPanel
              ref={editorRef}
              cesiumRef={cesiumRef}
              coordFormat={coordFormat}
              onCoordFormatChange={setCoordFormat}
              onError={(msg) => pushToast(msg, 'error', 3500)}
              onInfo={(msg) => pushToast(msg, 'info', 1800)}
            />
          </ErrorBoundary>
        </div>
      </div>

      {/* 垂直分割条 2（中|右）— 始终渲染；折叠时由 CSS 把该轨道收缩为 0 */}
      <HSplitter collapsed={rightCollapsed} onMouseDown={startDrag('right')} title="拖拽调节宽度" />

      {/* ===== 右列：AI 助手 ===== */}
      <div className={colClass('right', rightCollapsed)}>
        {rightCollapsed ? (
          <CollapseBar icon={'>'} label="AI" title="展开 AI 助手" onClick={() => setRightCollapsed(false)} />
        ) : (
          <>
            <AiStatusBanner />
            <AiSidePanel
              messages={aiMessages}
              streaming={aiStreaming}
              onSend={handleAiSend}
              onStop={handleStop}
              onRunCode={runSandboxCode}
              onApplyCode={handleApplyCode}
              lastError={lastError}
              onClearError={clearLastError}
              onClearConversation={() => setAiMessages([])}
              sceneContext={sceneContext}
              aiPlatforms={aiPlatforms}
              currentPlatform={aiCurrentPlatform}
              onChangePlatform={setAiCurrentPlatform}
              onOpenKeySettings={() => setKeySettingsOpen(true)}
              onCollapse={() => setRightCollapsed(true)}
            />
          </>
        )}
      </div>

      {/* AI Key 设置（三页共享弹窗） */}
      <AiKeySettings open={keySettingsOpen} onClose={() => setKeySettingsOpen(false)} />

      {/* AI 写工具确认弹窗 */}
      {writeConfirm && (
        <WriteToolConfirmModal
          request={writeConfirm}
          onApprove={() => {
            const resolve = writeConfirmResolveRef.current;
            writeConfirmResolveRef.current = null;
            setWriteConfirm(null);
            resolve && resolve({ approved: true });
          }}
          onReject={() => {
            const resolve = writeConfirmResolveRef.current;
            writeConfirmResolveRef.current = null;
            setWriteConfirm(null);
            resolve && resolve({ approved: false });
          }}
        />
      )}
    </div>
  );
}
