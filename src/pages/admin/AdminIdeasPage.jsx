import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useI18n } from '../../i18n/LanguageContext.jsx';
import { localize } from '../../i18n/localize.js';
import { supabase } from '../../lib/supabaseClient.js';
import {
  IDEA_FILTER_OPTIONS,
  IDEA_WORKLOAD,
  countIdeasByStatus,
  filterIdeas,
  ideaEmptyKey,
  loadAdminIdeas,
  moderateIdea,
  normalizeIdeaFilter,
  removeIdea,
} from '../../lib/adminIdeas.js';
import PageHeader from '../../components/PageHeader.jsx';
import FilterChips from '../../components/FilterChips.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Icon from '../../components/Icon.jsx';
import AdminIdeaCard from '../../components/admin/AdminIdeaCard.jsx';

/**
 * Ideen moderieren (Phase 1, Schritt 4).
 * Daten NUR über admin_list_ideas / admin_set_idea_status / admin_delete_idea (src/lib/adminApi.js).
 * Der Filter steht in der Adresse (?status=…), Wechsel ohne Neuladen der Seite.
 */
export default function AdminIdeasPage() {
  const { t, language } = useI18n();
  const [params, setParams] = useSearchParams();
  const filter = normalizeIdeaFilter(params.get('status') ?? 'all');

  const [list, setList] = useState({ status: 'loading', ideas: [], errorKey: null });
  const [reloadToken, setReloadToken] = useState(0);
  const [confirming, setConfirming] = useState(null); // { ideaId, to }
  const [pendingId, setPendingId] = useState(null);
  const [cardError, setCardError] = useState(null); // { ideaId, key }
  const [success, setSuccess] = useState(null); // Text der Erfolgsmeldung
  const busyRef = useRef(false);

  // Laden (beim Öffnen und bei "Aktualisieren")
  useEffect(() => {
    let active = true;
    loadAdminIdeas(supabase).then((result) => {
      if (!active) return;
      setList(
        result.errorKey
          ? { status: 'error', ideas: [], errorKey: result.errorKey }
          : { status: 'ready', ideas: result.ideas, errorKey: null },
      );
    });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  const reload = () => {
    setList((prev) => ({ ...prev, status: 'loading' }));
    setSuccess(null);
    setReloadToken((n) => n + 1);
  };

  const setFilter = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('status');
    else next.set('status', value);
    setParams(next, { replace: true });
    setConfirming(null);
  };

  const confirm = useCallback(
    async (ideaId, to) => {
      // Schutz vor Doppelklick: solange eine Aktion läuft, wird keine zweite gestartet
      // (der Ref greift sofort, der deaktivierte Knopf erst nach dem nächsten Rendern)
      if (busyRef.current) return;
      busyRef.current = true;
      setPendingId(ideaId);
      setCardError(null);
      setSuccess(null);
      const title = localize(list.ideas.find((item) => item.id === ideaId)?.title, language);
      const result =
        to === 'delete'
          ? await removeIdea(supabase, list.ideas, ideaId)
          : await moderateIdea(supabase, list.ideas, ideaId, to);
      setPendingId(null);
      busyRef.current = false;
      if (result.errorKey) {
        // Fehler: angezeigte Daten bleiben unverändert
        setCardError({ ideaId, key: result.errorKey });
        return;
      }
      setConfirming(null);
      // Liste (und damit Übersicht + Filter-Zahlen) sofort aktualisieren
      setList((prev) => ({ ...prev, ideas: result.ideas }));
      setSuccess(
        to === 'delete'
          ? t('admin.ideas.deleted', { title })
          : t('admin.ideas.success', { title, status: t(`status.idea.${to}`) }),
      );
      // Danach frisch aus der Datenbank laden (z. B. neue Unterstützerzahlen). Schlägt das fehl,
      // bleibt die bereits aktualisierte Liste stehen – die Änderung selbst war erfolgreich.
      const fresh = await loadAdminIdeas(supabase);
      if (!fresh.errorKey) setList((prev) => ({ ...prev, ideas: fresh.ideas }));
    },
    [list.ideas, t, language],
  );

  const counts = countIdeasByStatus(list.ideas);
  const visible = filterIdeas(list.ideas, filter);
  const filterOptions = IDEA_FILTER_OPTIONS.map((option) => ({
    value: option.value,
    label: `${t(option.labelKey)} (${counts[option.value]})`,
  }));

  return (
    <>
      <PageHeader
        title={t('admin.ideas.title')}
        subtitle={t('admin.ideas.subtitle')}
        actions={
          <button type="button" className="btn btn--secondary btn--sm" onClick={reload} disabled={list.status === 'loading'}>
            <Icon name="refresh" size={16} />
            {t('admin.refresh')}
          </button>
        }
      />

      {list.status === 'loading' && (
        <section className="card settings-block" role="status" aria-live="polite">
          <p>{t('admin.ideas.loading')}</p>
        </section>
      )}

      {list.status === 'error' && (
        <section className="card settings-block" role="alert">
          <p className="notice notice--error">
            <Icon name="info" size={16} />
            {t(list.errorKey)}
          </p>
          <button type="button" className="btn btn--primary btn--sm" onClick={reload}>
            {t('admin.statusError.retry')}
          </button>
        </section>
      )}

      {list.status === 'ready' && (
        <>
          <section aria-label={t('admin.ideas.workloadTitle')}>
            <ul className="stats">
              {IDEA_WORKLOAD.map((item) => (
                <li key={item.status} className="stat">
                  <span className="stat__value">{counts[item.status]}</span>
                  <span className="stat__label">{t(item.labelKey)}</span>
                </li>
              ))}
            </ul>
          </section>

          <FilterChips label={t('admin.filtersLabel')} options={filterOptions} value={filter} onChange={setFilter} />

          <div aria-live="polite">
            {success && (
              <p className="notice notice--success">
                <Icon name="check" size={16} />
                {success}
              </p>
            )}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon="lightbulb" title={t(ideaEmptyKey(filter))} />
          ) : (
            <div className="card-list">
              {visible.map((idea) => (
                <AdminIdeaCard
                  key={idea.id}
                  idea={idea}
                  confirmingTo={confirming?.ideaId === idea.id ? confirming.to : null}
                  pending={pendingId === idea.id}
                  errorKey={cardError?.ideaId === idea.id ? cardError.key : null}
                  onAsk={(ideaId, to) => {
                    setCardError(null);
                    setConfirming({ ideaId, to });
                  }}
                  onCancel={() => setConfirming(null)}
                  onConfirm={confirm}
                />
              ))}
            </div>
          )}

          <p className="hint">
            <Icon name="info" size={14} />
            {t('admin.ideas.privacyNote')}
          </p>
        </>
      )}
    </>
  );
}
