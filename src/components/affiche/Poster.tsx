/**
 * Poster.tsx — Rendu JSX de l'affiche A3
 *
 * Portage fidèle de `Poster.update()` (rendu impératif DOM du fork JS vanilla,
 * `assets/js/poster.js`) en composant React contrôlé. Le composant reçoit
 * l'état complet de l'affiche en props et produit l'arborescence de l'affiche
 * aux dimensions physiques d'origine (1123 × 1587 px).
 *
 * Le CSS (classes `poster-*`) relève de l'étape 5 : aucun style de mise en page
 * n'est défini ici, seuls les styles pilotés dynamiquement par le fork en JS
 * (couleurs, tailles de police, dimension d'icône, échelle d'aperçu) sont posés
 * en style inline, à l'identique du fork.
 */

import { Fragment, memo, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

import { COLORS, POSTER } from '#/lib/poster/config.ts'
import { hasEnglishContent } from '#/lib/poster/types.ts'
import type { PosterContent } from '#/lib/poster/types.ts'
import {
  formatDateEn,
  formatDateFr,
  formatTimeEn,
  formatTimeFr,
  getDateString,
  getTimeString,
} from '#/lib/poster/dateFormatter.ts'
import { getIconSvg } from '#/lib/poster/icons.ts'
import { PosterLogo } from '#/components/affiche/PosterLogo.tsx'

/** État complet de l'affiche reçu par le composant : le contenu canonique
 * (PosterContent, src/lib/poster/types.ts) — aucune prop supplémentaire. */
export type PosterProps = PosterContent

/**
 * Rendu contrôlé d'un message : `text.split('\n')` en intercalant des `<br />`.
 * Arbitrage retenu : rendu contrôlé (\n → <br>), PAS de dangerouslySetInnerHTML.
 */
function Message({ text, fontSize }: { text: string; fontSize: number }) {
  const lines = text.split('\n')

  return (
    <p className="poster-section-message" style={{ fontSize }}>
      {lines.map((line, index) => (
        <Fragment key={index}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </p>
  )
}

/**
 * Une « étoile » (astérisque) du divider — SVG à path fixe repris du fork
 * (`poster.js` ~lignes 209-213). Le `stroke` prend la couleur de bordure du thème.
 */
function DividerStar({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 6v12" />
        <path d="M17.196 9 6.804 15" />
        <path d="m6.804 9 10.392 6" />
      </svg>
    </div>
  )
}

/**
 * Mémoïsé : toutes les props sont des primitives, donc le poster (SVG logo/icône
 * lourds) n'est re-rendu que si l'affiche change réellement — pas pendant les
 * recalculs d'échelle de l'aperçu (setScale dans PosterPreview).
 */
export const Poster = memo(function Poster(props: PosterProps) {
  const {
    titleFr,
    messageFr,
    titleEn,
    messageEn,
    selectedIcon,
    colorKey,
    dateStart,
    dateEnd,
    timeStart,
    timeEnd,
    fontSizeIcon,
    fontSizeTitle,
    fontSizeMessage,
    fontSizeInfo,
    isAutoSizeMode,
  } = props

  // --- Champs dérivés (calculés, non stockés) ------------------------------
  const color = COLORS[colorKey]
  const backgroundColor = color.bg
  // On élargit color.text en `string` : sinon TS considère la branche `||`
  // inatteignable (color.icon est un littéral toujours truthy) et la typerait
  // `never`. On préserve la sémantique du fork (`color.icon || color.text`).
  const textColor: string = color.text
  const iconColor = color.icon || textColor

  // Section EN + divider pilotés par la présence de contenu anglais.
  const showEnglish = hasEnglishContent({ titleEn, messageEn })
  const showIcon = selectedIcon !== 'none'

  // Dates / heures (reproduction de _getDates / _getHours du fork).
  const dates = getDateString(dateStart, dateEnd)
  const hours = getTimeString(timeStart, timeEnd)

  const hasInfoFr = dates.start !== null || hours.full !== null
  const hasInfoEn = hasInfoFr

  // Couleurs + fond posés en style inline, avec --poster-bg pour le masque
  // central du divider (::before), exactement comme le fork.
  const posterStyle = {
    backgroundColor,
    color: color.text,
    '--poster-bg': backgroundColor,
  } as CSSProperties

  // L'icône est injectée telle quelle (SVG statique interne, pas de saisie
  // utilisateur → dangerouslySetInnerHTML sûr). Fidélité au fork (`_updateIcon`) :
  // la taille du slider n'est appliquée qu'en mode MANUEL, et en STYLE INLINE
  // (qui bat la règle CSS `.poster-icon svg { width:140px }`). En mode auto, on
  // n'injecte rien : le SVG retombe sur le 140px du CSS, comme le fork.
  const iconSvg = showIcon
    ? isAutoSizeMode
      ? getIconSvg(selectedIcon)
      : getIconSvg(selectedIcon).replace(
          '<svg',
          `<svg style="width:${fontSizeIcon}px;height:${fontSizeIcon}px"`,
        )
    : ''

  return (
    <div className="poster" id="poster" style={posterStyle}>
      {/* ZONE ICÔNE (en haut) */}
      {showIcon && (
        <div className="poster-zone-icon">
          <div
            className="poster-icon"
            style={{ color: iconColor }}
            dangerouslySetInnerHTML={{ __html: iconSvg }}
          />
        </div>
      )}

      {/* ZONE CONTENU PRINCIPAL */}
      <div className="poster-zone-content">
        {/* Section française */}
        <section className="poster-zone-section">
          <h1 className="poster-section-title" style={{ fontSize: fontSizeTitle }}>
            {titleFr}
          </h1>
          <Message text={messageFr} fontSize={fontSizeMessage} />
          {hasInfoFr && (
            <div className="poster-section-info" style={{ fontSize: fontSizeInfo }}>
              {dates.start !== null &&
                (dates.isRange ? (
                  <p>
                    Du {formatDateFr(dates.start)} au {formatDateFr(dates.end ?? '')}
                  </p>
                ) : (
                  <p>Le {formatDateFr(dates.start)}</p>
                ))}
              {hours.full !== null && <p>{formatTimeFr(hours.full)}</p>}
            </div>
          )}
        </section>

        {/* Divider (visible seulement si la section EN est visible) */}
        {showEnglish && (
          <div className="poster-divider" style={{ color: color.border }}>
            <div
              className="poster-stars-container"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                zIndex: 10,
              }}
            >
              {[0, 1, 2, 3].map((i) => (
                <DividerStar key={i} color={color.border} />
              ))}
            </div>
          </div>
        )}

        {/* Section anglaise */}
        {showEnglish && (
          <section className="poster-zone-section">
            <h1 className="poster-section-title" style={{ fontSize: fontSizeTitle }}>
              {titleEn}
            </h1>
            <Message text={messageEn} fontSize={fontSizeMessage} />
            {hasInfoEn && (
              <div className="poster-section-info" style={{ fontSize: fontSizeInfo }}>
                {dates.start !== null &&
                  (dates.isRange ? (
                    <p>
                      From {formatDateEn(dates.start)} to {formatDateEn(dates.end ?? '')}
                    </p>
                  ) : (
                    <p>On {formatDateEn(dates.start)}</p>
                  ))}
                {hours.full !== null && <p>{formatTimeEn(hours.full)}</p>}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ZONE BAS DE PAGE (logo, toujours visible) */}
      <div className="poster-zone-footer">
        <PosterLogo colorKey={colorKey} textColor={color.text} />
      </div>
    </div>
  )
})

/**
 * Wrapper d'aperçu à l'écran — portage de `adjustScale()` du fork.
 *
 * Le poster conserve ses dimensions physiques (1123 × 1587 px) ; ce wrapper
 * applique `transform: scale(optimalScale)` pour le faire tenir dans le
 * conteneur d'aperçu. Le scale est recalculé au montage et à chaque redimension
 * via un ResizeObserver. À l'impression, ce transform sera neutralisé par le CSS
 * (étape 5) — aucune logique d'impression ici.
 */
export function PosterPreview(props: PosterProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const content = contentRef.current
    if (!content) return

    const recompute = () => {
      // Dimensions disponibles (marge de 40 px comme dans le fork).
      const availableWidth = content.clientWidth - 40
      const availableHeight = content.clientHeight - 40

      const scaleWidth = availableWidth / POSTER.width
      const scaleHeight = availableHeight / POSTER.height
      // On ne dépasse jamais l'échelle 1 (pas d'agrandissement).
      setScale(Math.min(scaleWidth, scaleHeight, 1))
    }

    recompute()
    const observer = new ResizeObserver(recompute)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={contentRef} className="poster-preview-content">
      <div
        className="poster-wrapper"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
      >
        <Poster {...props} />
      </div>
    </div>
  )
}
