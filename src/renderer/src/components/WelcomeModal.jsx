import { useI18n } from '../i18n'
import Dialog from './Dialog'

function WelcomeModal({ onClose }) {
  const { t } = useI18n()

  const handleStart = async () => {
    await window.api.dismissWelcome()
    onClose()
  }

  return (
    <Dialog
      labelledBy="welcome-title"
      className="welcome-modal"
      backdropClassName="welcome-backdrop"
    >
      {/* 화면 오른쪽 가장자리 그림: 언어 방향과 무관하게 물리 위치 */}
      <div className="welcome-illust" aria-hidden="true" dir="ltr">
        <div className="welcome-screen">
          <div className="welcome-panel-mini">
            <div className="welcome-bar"></div>
            <div className="welcome-bar"></div>
            <div className="welcome-bar"></div>
          </div>
          <div className="welcome-cursor">↖</div>
          <div className="welcome-arrow">→</div>
        </div>
      </div>

      <div className="welcome-title" id="welcome-title">
        {t('welcome.title')}
      </div>

      <ol className="welcome-steps">
        <li>
          <span className="step-num">1</span>
          <div>
            <strong>{t('welcome.step1')}</strong>
            <div className="step-desc">{t('welcome.step1desc')}</div>
          </div>
        </li>
        <li>
          <span className="step-num">2</span>
          <div>
            <strong>{t('welcome.step2')}</strong>
            <div className="step-desc">{t('welcome.step2desc')}</div>
          </div>
        </li>
        <li>
          <span className="step-num">3</span>
          <div>
            <strong>{t('welcome.step3')}</strong>
            <div className="step-desc">{t('welcome.step3desc')}</div>
          </div>
        </li>
      </ol>

      <div className="modal-actions">
        <button type="button" className="primary big-btn" onClick={handleStart} autoFocus>
          {t('welcome.start')}
        </button>
      </div>
    </Dialog>
  )
}

export default WelcomeModal
