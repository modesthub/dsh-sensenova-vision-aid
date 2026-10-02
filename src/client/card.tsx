/**
 * SenseNova 视觉辅助的 Models 页 provider 卡片（settings.models.provider-card slot）。
 *
 * 只读状态卡片：显示「已配置/未配置」徽标、凭据复用状态、子 agent 路径状态与
 * 模型链摘要，并引导用户前往「设置 → SenseNova 视觉辅助」完成配置。不内嵌密钥
 * 输入框——密钥写入一律在设置页经凭据域完成，避免在 Models 页出现第二个写入口。
 */
import type { SettingsState, TranslateFn } from './settings';

export interface VisionAidCardProps {
  t: TranslateFn;
  /** slots 框架注入的 uSES hook（由 injected.hooks.visionAidSettings 派生）。 */
  useVisionAidSettings: <S>(selector: (snapshot: SettingsState) => S) => S;
  /** Models 页 owner props（参考实现的 provider.active / keyConfigured）。 */
  provider?: { active?: boolean };
  keyConfigured?: boolean;
}

export function VisionAidProviderCard(props: VisionAidCardProps): JSX.Element {
  const { t } = props;
  const state = props.useVisionAidSettings !== undefined
    ? props.useVisionAidSettings((snapshot) => snapshot)
    : undefined;

  const configured = state !== undefined && state.available
    ? state.keyRefConfigured
    : (props.keyConfigured ?? false);
  const active = props.provider?.active ?? false;
  const showBody = state !== undefined && state.available;

  return (
    <div className="sn-providerCard" data-sn-vision-card="true">
      <div className="sn-field">
        <div className="sn-fieldHead">
          <span className="sn-label">{t('cardTitle')}</span>
          <span className="sn-badges">
            <span className={configured ? 'sn-badge' : 'sn-badgeMuted'}>
              {configured ? t('apiKeySet') : t('apiKeyUnset')}
            </span>
            {active ? <span className="sn-badge">{t('cardRouteActive')}</span> : null}
          </span>
        </div>
        {!showBody ? (
          <p className="sn-hint">
            {state === undefined ? t('cardRegistrationHint') : t('cardLoadingHint')}
          </p>
        ) : configured ? (
          <p className="sn-hint">{t('cardConfiguredHint', { ref: state.keyRef })}</p>
        ) : (
          <p className="sn-hint">{t('cardUnconfiguredHint')}</p>
        )}
      </div>
      {showBody ? (
        <p className="sn-hint">
          {state.reuseFreeapiCredentials ? t('cardReuseOn') : t('cardReuseOff')}
          {' · '}
          {state.useSubagent ? t('cardSubagentOn') : t('cardSubagentOff')}
          {' · '}
          {t('cardModel')}: {state.modelChain}
        </p>
      ) : null}
    </div>
  );
}
