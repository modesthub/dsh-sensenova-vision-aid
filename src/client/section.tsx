/**
 * SenseNova 视觉辅助设置页 React 组件（settings.section slot 内容）。
 * 所有文案经 `t`（settings.vision-sensenova 命名空间）读取，不硬编码。
 */
import { useState } from 'react';
import * as React from 'react';
import { keyRefOptions } from './settings';
import type {
  DiagnosticsState,
  FieldName,
  SettingsState,
  TestConnectionState,
  TranslateFn,
} from './settings';

interface ReactHooks {
  useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  useRef<T>(initialValue: T): { current: T };
}

const { useEffect, useRef } = React as unknown as ReactHooks;

/** 输入框 change 事件的最小结构（宿主模块表提供真实 React 类型）。 */
interface ChangeEventLike {
  target: { value: string };
}

/** 复选框 change 事件的最小结构。 */
interface ToggleEventLike {
  target: { checked: boolean };
}

export interface VisionAidSectionProps {
  t: TranslateFn;
  /** slots 框架注入的 uSES hook（由 injected.hooks.visionAidSettings 派生）。 */
  useVisionAidSettings: <S>(selector: (snapshot: SettingsState) => S) => S;
  edit: (field: FieldName, text: string) => void;
  save: () => void;
  discard: () => void;
  setReuseFreeapi: (on: boolean) => void;
  editKeyDraft: (text: string) => void;
  toggleClearStaged: () => void;
  refreshDiagnostics: () => void;
  testConnection: () => void;
}

function useSavedFlash(savedCount: number): boolean {
  const [visible, setVisible] = useState(false);
  const previousCount = useRef(savedCount);

  useEffect(() => {
    if (savedCount === previousCount.current) return;
    previousCount.current = savedCount;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(timer);
  }, [savedCount]);

  return visible;
}

/** 凭据状态徽标：已配置 / 未配置。 */
function StatusBadge({ configured, t }: { configured: boolean; t: TranslateFn }): JSX.Element {
  return (
    <span className={configured ? 'sn-badge' : 'sn-badgeMuted'}>
      {configured ? t('apiKeySet') : t('apiKeyUnset')}
    </span>
  );
}

/** 分组标题：引导后续卡片的分区归属。 */
function SectionHeading(props: { text: string }): JSX.Element {
  return <h3 className="sn-groupTitle">{props.text}</h3>;
}

/** 开关行（label + checkbox 并排）。 */
function ToggleField(props: {
  t: TranslateFn;
  id: string;
  labelKey: string;
  hintKey: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <div className="sn-field">
      <label className="sn-fieldHead" htmlFor={props.id}>
        <span className="sn-label">{props.t(props.labelKey)}</span>
        <input
          id={props.id}
          className="sn-toggle"
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled}
          onChange={(event: ToggleEventLike) => props.onChange(event.target.checked)}
        />
      </label>
      <p className="sn-hint">{props.t(props.hintKey)}</p>
    </div>
  );
}

/** 凭据区（分组 2）：复用开关 + ref 选择 + 关闭复用时的密钥输入框。 */
function CredentialsCard(props: {
  t: TranslateFn;
  state: SettingsState;
  disabled: boolean;
  edit: (field: FieldName, text: string) => void;
  setReuseFreeapi: (on: boolean) => void;
  editKeyDraft: (text: string) => void;
  toggleClearStaged: () => void;
}): JSX.Element {
  const { t, state } = props;
  const [visible, setVisible] = useState(false);
  const reuseOn = state.reuseFreeapiCredentialsDraft;
  const keyWriteResult = state.keyWriteResult;

  return (
    <div className="sn-card">
      <ToggleField
        t={t}
        id="sn-vision-reuse"
        labelKey="reuseFreeapi"
        hintKey={reuseOn ? 'reuseFreeapiHint' : 'reuseFreeapiOffHint'}
        checked={reuseOn}
        disabled={props.disabled}
        onChange={props.setReuseFreeapi}
      />

      <div className="sn-field">
        <div className="sn-fieldHead">
          <label className="sn-label" htmlFor="sn-vision-keyref">
            {t('keyRef')}
          </label>
          <span className="sn-badges">
            <StatusBadge configured={state.keyRefConfigured} t={t} />
          </span>
        </div>
        <div className="sn-activeAccountSelect">
          <select
            id="sn-vision-keyref"
            className="sn-input"
            value={state.keyRefDraft}
            disabled={props.disabled}
            onChange={(event: ChangeEventLike) => props.edit('keyRef', event.target.value)}
          >
            {keyRefOptions().map((ref) => (
              <option key={ref} value={ref}>
                {ref}
              </option>
            ))}
          </select>
          <span className="sn-selectChevron" aria-hidden="true" />
        </div>
        <p className="sn-hint">
          {reuseOn ? t('keyRefHint') : t('keyRefOptionsHint')}
        </p>
      </div>

      {!reuseOn ? (
        <div className="sn-field">
          <div className="sn-fieldHead">
            <label className="sn-label" htmlFor="sn-vision-key">
              {t('apiKey')}
            </label>
            <span className="sn-badges">
              <button
                type="button"
                className="sn-reset"
                disabled={props.disabled}
                onClick={() => setVisible((v) => !v)}
              >
                {visible ? t('hide') : t('show')}
              </button>
              {state.keyRefConfigured ? (
                <button
                  type="button"
                  className="sn-reset"
                  disabled={props.disabled}
                  onClick={props.toggleClearStaged}
                >
                  {t('clearKey')}
                </button>
              ) : null}
            </span>
          </div>
          <input
            id="sn-vision-key"
            className="sn-input"
            type={visible ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={state.keyDraft}
            disabled={props.disabled}
            onChange={(event: ChangeEventLike) => props.editKeyDraft(event.target.value)}
          />
          <p className="sn-hint">
            {state.clearStaged
              ? t('keyClearStaged')
              : t('apiKeyHint')}
          </p>
          {keyWriteResult === 'saved' ? (
            <p className="sn-saved" role="status">{t('keySaved')}</p>
          ) : keyWriteResult === 'failed' ? (
            <p className="sn-failed" role="status">{t('saveFailed')}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** 连接与兜底区（分组 3，高级折叠卡）：apiBase / modelChain / imageMode / timeoutMs。 */
function ConnectionAdvancedCard(props: {
  t: TranslateFn;
  state: SettingsState;
  disabled: boolean;
  edit: (field: FieldName, text: string) => void;
}): JSX.Element {
  const { t, state } = props;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="sn-card sn-advanced">
      <button
        type="button"
        className="sn-advancedHeader"
        aria-expanded={expanded}
        aria-controls="sn-vision-advanced"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="sn-label">{t('advancedSettings')}</span>
        <span className="sn-advancedMeta">
          <span
            className={`sn-advancedChevron${expanded ? ' sn-advancedChevronExpanded' : ''}`}
            aria-hidden="true"
          />
        </span>
      </button>
      <div id="sn-vision-advanced" className="sn-advancedBody" hidden={!expanded}>
        <div className="sn-field">
          <label className="sn-label" htmlFor="sn-vision-api-base">
            {t('apiBase')}
          </label>
          <input
            id="sn-vision-api-base"
            className="sn-input"
            type="text"
            value={state.apiBaseDraft}
            disabled={props.disabled}
            spellCheck={false}
            onChange={(event: ChangeEventLike) => props.edit('apiBase', event.target.value)}
          />
          <p className="sn-hint">{t('apiBaseHint')}</p>
        </div>
        <div className="sn-field">
          <label className="sn-label" htmlFor="sn-vision-model-chain">
            {t('modelChain')}
          </label>
          <input
            id="sn-vision-model-chain"
            className="sn-input"
            type="text"
            value={state.modelChainDraft}
            disabled={props.disabled}
            spellCheck={false}
            onChange={(event: ChangeEventLike) => props.edit('modelChain', event.target.value)}
          />
          <p className="sn-hint">{t('modelChainHint')}</p>
        </div>
        <div className="sn-field">
          <label className="sn-label" htmlFor="sn-vision-image-mode">
            {t('imageMode')}
          </label>
          <div className="sn-activeAccountSelect">
            <select
              id="sn-vision-image-mode"
              className="sn-input"
              value={state.imageModeDraft}
              disabled={props.disabled}
              onChange={(event: ChangeEventLike) => props.edit('imageMode', event.target.value)}
            >
              <option value="image_url">{t('imageModeImageUrl')}</option>
              <option value="image_base64">{t('imageModeImageBase64')}</option>
            </select>
            <span className="sn-selectChevron" aria-hidden="true" />
          </div>
          <p className="sn-hint">{t('imageModeHint')}</p>
        </div>
        <div className="sn-field">
          <label className="sn-label" htmlFor="sn-vision-timeout">
            {t('timeoutMs')}
          </label>
          <input
            id="sn-vision-timeout"
            className="sn-input"
            type="number"
            min={1000}
            step={1000}
            value={state.timeoutMsDraft}
            disabled={props.disabled}
            spellCheck={false}
            onChange={(event: ChangeEventLike) => props.edit('timeoutMs', event.target.value)}
          />
          <p className="sn-hint">{t('timeoutMsHint')}</p>
        </div>
      </div>
    </div>
  );
}

/** 测试连接区块（只读运行数据，不参与保存）。 */
function TestConnectionPanel(props: {
  t: TranslateFn;
  state: TestConnectionState;
  onTest: () => void;
}): JSX.Element {
  const test = props.state;
  const busy = test.status === 'loading';

  let body: JSX.Element;
  if (test.status === 'idle') {
    body = <p className="sn-hint">{props.t('testConnectionIdle')}</p>;
  } else if (test.status === 'ok') {
    body = (
      <p className="sn-saved" role="status">
        {props.t('testConnectionOk')}
        {test.model !== undefined ? ` — ${props.t('testConnectionOkHint', { model: test.model })}` : ''}
      </p>
    );
  } else if (test.status === 'error') {
    body = (
      <p className="sn-failed" role="status">
        {props.t('testConnectionFail')}
        {test.reason !== undefined ? ` — ${props.t('testConnectionFailHint', { reason: test.reason })}` : ''}
      </p>
    );
  } else {
    body = <p className="sn-hint">{props.t('testConnectionRunning')}</p>;
  }

  return (
    <div className="sn-card">
      <div className="sn-fieldHead">
        <span className="sn-label">{props.t('testConnection')}</span>
        <button
          type="button"
          className="sn-linkButton"
          disabled={busy}
          onClick={() => props.onTest()}
        >
          {busy ? props.t('testConnectionRunning') : props.t('testConnection')}
        </button>
      </div>
      <p className="sn-hint">{props.t('testConnectionHint')}</p>
      {body}
    </div>
  );
}

/** 诊断区块（只读，host 状态路由）。 */
function DiagnosticsPanel(props: {
  t: TranslateFn;
  state: DiagnosticsState;
  onRefresh: () => void;
}): JSX.Element {
  const diag = props.state;
  const busy = diag.status === 'loading';
  const snapshot = diag.snapshot;

  let body: JSX.Element;
  if (diag.status === 'idle') {
    body = <p className="sn-hint">{props.t('diagnosticsIntro')}</p>;
  } else if (diag.status === 'error' || snapshot === undefined) {
    body = <p className="sn-hint sn-diagnosticsWarn">{props.t('diagnosticsUnavailable')}</p>;
  } else {
    body = (
      <div className="sn-diagnosticsBody">
        <div className="sn-diagnosticsTags">
          <span>
            {snapshot.serviceAvailable
              ? props.t('diagServiceAvailable')
              : props.t('diagServiceUnavailable')}
          </span>
          <span>
            {props.t('diagApiBase')}: <span className="sn-mono">{snapshot.apiBase}</span>
          </span>
          <span>
            {props.t('diagImageMode')}: <span className="sn-mono">{snapshot.imageMode}</span>
          </span>
        </div>
        <div className="sn-field">
          <span className="sn-labelSmall">{props.t('diagRefs')}</span>
          {snapshot.refs.length > 0 ? (
            <div className="sn-diagnosticsTags">
              {snapshot.refs.map((ref) => (
                <span key={ref.name}>
                  <span className="sn-mono">{ref.name}</span>
                  {' '}
                  {ref.configured ? props.t('diagRefConfigured') : props.t('diagRefMissing')}
                </span>
              ))}
            </div>
          ) : (
            <p className="sn-hint">—</p>
          )}
        </div>
        <div className="sn-field">
          <span className="sn-labelSmall">{props.t('diagModelChain')}</span>
          <p className="sn-hint sn-mono">{snapshot.modelChain}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sn-card sn-diagnostics">
      <div className="sn-fieldHead">
        <span className="sn-label">{props.t('groupDiagnostics')}</span>
        <button
          type="button"
          className="sn-linkButton"
          disabled={busy}
          onClick={() => props.onRefresh()}
        >
          {busy ? props.t('diagnosticsLoading') : props.t('diagnosticsRefresh')}
        </button>
      </div>
      <p className="sn-hint">{props.t('diagnosticsIntro')}</p>
      {body}
    </div>
  );
}

export function VisionAidSection(props: VisionAidSectionProps): JSX.Element {
  const { t } = props;
  const state = props.useVisionAidSettings((s) => s);
  const disabled = !state.writable;
  const savedVisible = useSavedFlash(state.savedCount);

  return (
    <section className="sn-section" aria-label={t('title')}>
      <h2 className="sn-title">{t('title')}</h2>
      <p className="sn-intro">{t('intro')}</p>
      {!state.writable ? (
        <p className="sn-readOnly" role="status">
          {t('readOnly')}
        </p>
      ) : null}

      {/* 分组 1：接入信息 */}
      <SectionHeading text={t('routeLabel')} />
      <div className="sn-card sn-cardCompact">
        <div className="sn-field">
          <div className="sn-fieldHead">
            <span className="sn-label">{t('routeLabel')}</span>
            <span className="sn-badges">
              <span className="sn-badge">{state.route}</span>
            </span>
          </div>
          <p className="sn-hint">{state.displayName}</p>
        </div>
      </div>

      {/* 分组 2：凭据与复用 */}
      <SectionHeading text={t('groupCredentials')} />
      <CredentialsCard
        t={t}
        state={state}
        disabled={disabled}
        edit={props.edit}
        setReuseFreeapi={props.setReuseFreeapi}
        editKeyDraft={props.editKeyDraft}
        toggleClearStaged={props.toggleClearStaged}
      />

      {/* 分组 3：连接与兜底（高级折叠卡） */}
      <SectionHeading text={t('groupConnection')} />
      <ConnectionAdvancedCard t={t} state={state} disabled={disabled} edit={props.edit} />

      {/* 分组 5：测试连接（只读运行数据） */}
      <SectionHeading text={t('testConnection')} />
      <TestConnectionPanel t={t} state={state.test} onTest={props.testConnection} />

      {/* 分组 6：诊断（只读运行数据） */}
      <SectionHeading text={t('groupDiagnostics')} />
      <DiagnosticsPanel t={t} state={state.diagnostics} onRefresh={props.refreshDiagnostics} />

      {/* 保存 / 重置 */}
      <div className="sn-footer">
        <div className="sn-footerStatus">
          {state.failed ? (
            <p className="sn-failed" role="status">
              {t('saveFailed')}
            </p>
          ) : savedVisible && !state.dirty ? (
            <p className="sn-saved" role="status">
              {t('saved')}
            </p>
          ) : state.dirty ? (
            <span className="sn-unsaved">{t('unsaved')}</span>
          ) : null}
        </div>
        <div className="sn-footerActions">
          <button type="button" className="sn-btnGhost" disabled={!state.dirty || state.saving} onClick={props.discard}>
            {t('reset')}
          </button>
          <button type="button" className="sn-btnPrimary" disabled={!state.dirty || state.saving} onClick={props.save}>
            {state.saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </section>
  );
}
