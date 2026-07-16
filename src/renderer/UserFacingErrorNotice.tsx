import { actions } from '../shared/presentation/ja/index.js';
import type { RendererUserFacingError } from './session-orchestrator.js';

export const UserFacingErrorNotice = ({ error }: { error: RendererUserFacingError }) => (
  <section className="user-error" role="alert" aria-labelledby="user-error-title">
    <h2 id="user-error-title">{error.presentation.title}</h2>
    <p>{error.presentation.message}</p>
    {error.presentation.dataSafety ? <p>{error.presentation.dataSafety}</p> : null}
    {error.presentation.nextAction ? <p>{error.presentation.nextAction}</p> : null}
    <details>
      <summary>
        <span className="details-closed-label">{actions.showDetails}</span>
        <span className="details-open-label">{actions.hideDetails}</span>
      </summary>
      <dl>
        <div><dt>エラーコード</dt><dd><code>{error.code}</code></dd></div>
      </dl>
    </details>
  </section>
);
