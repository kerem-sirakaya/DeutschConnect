import { useLanguage } from '../i18n/LanguageContext.jsx';
import { PageIntro, SectionHeading } from '../components/UI.jsx';
import Icon from '../components/Icon.jsx';

export default function About() {
  const { t } = useLanguage();
  return <>
    <PageIntro eyebrow={t.nav.about} title={t.aboutPage.title} description={t.aboutPage.description} />
    <div className="about-layout"><article className="content-card prose"><h2>{t.aboutPage.storyTitle}</h2><p>{t.aboutPage.storyText}</p><h2>{t.aboutPage.missionTitle}</h2><p>{t.aboutPage.missionText}</p></article><aside className="content-card project-card"><span className="detail-icon"><Icon name="spark" size={30} /></span><h2>{t.aboutPage.statusTitle}</h2><p>{t.aboutPage.statusText}</p></aside></div>
    <section className="section-block"><SectionHeading title={t.aboutPage.valuesTitle} /><div className="ideas-grid">{t.aboutPage.values.map((value, index) => <article className="content-card" key={index}><span className="value-icon"><Icon name={['bulb', 'heart', 'globe'][index]} size={26} /></span><h3>{value.title}</h3><p>{value.text}</p></article>)}</div></section>
  </>;
}
