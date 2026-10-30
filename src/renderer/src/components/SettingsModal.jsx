import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { LANGUAGES } from '../../../shared/languages.js'
import Dialog from './Dialog'

const CONTACT_EMAIL = 'sngmng6506@gmail.com'
const SUPPORT_URL = 'https://ko-fi.com/sngmng'

function SettingsModal({ onClose }) {
  const { t, lang, setLang } = useI18n()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [autoStart, setAutoStart] = useState(false)
  const [version, setVersion] = useState('')
  const [updateAvailable, setUpdateAvailable] = useState(null)
  const [updateReady, setUpdateReady] = useState(null)
  const [check, setCheck] = useState(null) // null | 'checking' | 'latest' | 'available' | 'ready' | 'error'

  useEffect(() => {
    window.api
      .getSettings()
      .then((s) => {
        setAutoStart(!!s.autoStart)
        setVersion(s.version || '')
      })
      .catch(() => {})
    window.api
      .getUpdate()
      .then((u) => {
        if (u?.available) setUpdateAvailable(u.available)
        if (u?.ready) setUpdateReady(u.ready)
      })
      .catch(() => {})
    const u1 = window.api.onUpdateAvailable(setUpdateAvailable)
    const u2 = window.api.onUpdateReady(setUpdateReady)
    return () => {
      u1()
      u2()
    }
  }, [])

  const toggleAutoStart = async () => {
    setBusy(true)
    try {
      setAutoStart(!!(await window.api.setAutoStart(!autoStart)))
      setNotice('')
    } catch {
      setNotice(t('settings.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const resetSize = async () => {
    try {
      await window.api.resetPanelSize()
      setNotice(t('settings.sizeReset'))
    } catch {
      setNotice(t('settings.actionFailed'))
    }
  }

  const checkUpdate = async () => {
    setCheck('checking')
    try {
      const r = await window.api.checkUpdate()
      setCheck(r?.status || 'error')
    } catch {
      setCheck('error')
    }
  }
  const checkLabel = {
    checking: t('settings.checking'),
    latest: t('settings.upToDate'),
    error: t('settings.checkFailed')
  }[check]

  const openExternal = (url) => () => window.api.openExternal(url)

  return (
    <Dialog
      onClose={onClose}
      labelledBy="settings-title"
      className="settings-modal"
      backdropClassName="settings-backdrop"
      closeOnBackdrop={false}
    >
      <header className="settings-header">
        <h2 id="settings-title">{t('settings.title')}</h2>
        <button
          autoFocus
          className="settings-close"
          type="button"
          onClick={onClose}
          aria-label={t('settings.close')}
        >
          ×
        </button>
      </header>
      <div className="settings-body">
        {updateReady && (
          <button
            type="button"
            className="update-banner ready"
            onClick={() => window.api.installUpdate()}
          >
            <span>
              v{updateReady.version} {t('settings.updateReady')}
            </span>
            <span>↻</span>
          </button>
        )}
        {!updateReady && updateAvailable?.manual && (
          <button
            type="button"
            className="update-banner ready"
            onClick={() => window.api.installUpdate()}
          >
            <span>
              v{updateAvailable.version} {t('settings.updateManual')}
            </span>
            <span>↓</span>
          </button>
        )}
        {!updateReady && updateAvailable && !updateAvailable.manual && (
          <div className="update-banner downloading">
            <span>
              v{updateAvailable.version} {t('settings.updateDownloading')}
            </span>
          </div>
        )}

        <section className="settings-section" aria-labelledby="settings-general">
          <h3 id="settings-general">{t('settings.general')}</h3>
          <label className="setting-row">
            <span>{t('settings.autostart')}</span>
            <input
              className="settings-switch"
              type="checkbox"
              role="switch"
              checked={autoStart}
              disabled={busy}
              onChange={toggleAutoStart}
            />
          </label>
          <label className="setting-row">
            <span>{t('settings.language')}</span>
            <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="setting-row setting-action reset-panel-size"
            onClick={resetSize}
          >
            <span>{t('settings.resetSize')}</span>
            <span aria-hidden="true">↺</span>
          </button>
          {notice && (
            <p className="settings-status" role="status">
              {notice}
            </p>
          )}
        </section>
        <section className="settings-section" aria-labelledby="settings-about">
          <h3 id="settings-about">{t('settings.about')}</h3>
          <div className="setting-row">
            <span>{t('settings.version')}</span>
            <span className="settings-value">{version || '—'}</span>
          </div>
          <button
            type="button"
            className="setting-row setting-action check-update"
            onClick={checkUpdate}
            disabled={check === 'checking'}
          >
            <span>{t('settings.checkUpdate')}</span>
            <span aria-hidden="true">↻</span>
          </button>
          {checkLabel && (
            <p className="settings-status" role="status">
              {checkLabel}
            </p>
          )}
          <button
            type="button"
            className="setting-row setting-action"
            onClick={openExternal(`mailto:${CONTACT_EMAIL}`)}
            title={t('settings.contactTitle')}
          >
            <span>{t('settings.contact')}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </section>
        <section className="settings-section" aria-labelledby="settings-support">
          <h3 id="settings-support">{t('settings.support')}</h3>
          <button
            type="button"
            className="setting-row setting-action"
            onClick={openExternal(SUPPORT_URL)}
          >
            <span>{t('settings.supportKofi')}</span>
            <span aria-hidden="true">↗</span>
          </button>
        </section>
      </div>
    </Dialog>
  )
}

export default SettingsModal
