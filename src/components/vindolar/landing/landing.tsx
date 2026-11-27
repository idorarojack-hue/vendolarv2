import React from 'react';
import { generateOAuthURL } from '@/components/shared';
import MarketTicker from '@/components/vindolar/market-ticker';
import { RiskDialog } from '@/pages/main/global-status';
import { localize } from '@deriv-com/translations';
import { REVIEWS, TReview } from './reviews';
import './landing.scss';

type TFeature = {
    icon: string;
    tool: string;
    tag: string;
    text: string;
};

/*
 * What's inside Vindolar, shown where other sites put reviews. These cards describe the
 * tools — they are not customer reviews and make no profit claims.
 */
const FEATURES = (): TFeature[] => [
    {
        icon: 'BB',
        tool: localize('Bot Builder'),
        tag: localize('No code'),
        text: localize(
            'Drag blocks together to build a bot: market, entry rules, stake and limits. Save it, load it later or start from a ready-made strategy.'
        ),
    },
    {
        icon: 'AT',
        tool: localize('Analysis Tools'),
        tag: localize('Live data'),
        text: localize(
            'Last-digit statistics update tick by tick across every Volatility index, ranked so the most and least frequent digits stand out.'
        ),
    },
    {
        icon: 'ST',
        tool: localize('Confluence AI'),
        tag: localize('Back-test'),
        text: localize(
            'Replay a strategy on up to 20,000 real ticks before you trade it, with the win rate, break-even line and equity curve.'
        ),
    },
    {
        icon: 'AS',
        tool: localize('Auto Trading'),
        tag: localize('Automation'),
        text: localize(
            'Run a strategy hands-free with a take profit and a stop loss that cannot be skipped, plus a daily loss limit.'
        ),
    },
    {
        icon: 'MS',
        tool: localize('Pulse AI Scanner'),
        tag: localize('Scanner'),
        text: localize(
            'Scan every synthetic market at once and jump to the one whose digit pattern matches your rules.'
        ),
    },
    {
        icon: 'RP',
        tool: localize('Reports'),
        tag: localize('Track'),
        text: localize(
            'Every contract from every tool in one place, with your profit table and statement pulled from Deriv.'
        ),
    },
];

type TTool = { icon: string; title: string; text: string; hash: string };

/** Tool cards; clicking one opens that tab in the workspace. */
const TOOLS = (): TTool[] => [
    {
        icon: '♧',
        title: localize('Free Bot Library'),
        text: localize('Load classic strategies into the builder. No coding needed.'),
        hash: 'free_bots',
    },
    {
        icon: '↺',
        title: localize('TickPulse'),
        text: localize('Switches market or contract after a loss, inside your stop loss.'),
        hash: 'recovery_trader',
    },
    {
        icon: '⌕',
        title: localize('Market Analysis'),
        text: localize('Digit circles, tick history and live statistics for every index.'),
        hash: 'analysis_tools',
    },
    {
        icon: '◴',
        title: localize('Speedbot'),
        text: localize('Fast one-tap trading with a session limit on every run.'),
        hash: 'speed_trader',
    },
    {
        icon: '▥',
        title: localize('Charts'),
        text: localize('Full charts with technical indicators for your own research.'),
        hash: 'chart',
    },
    {
        icon: '⚙',
        title: localize('Bot Builder'),
        text: localize('Visual drag-and-drop builder. Test your logic on demo first.'),
        hash: 'bot_builder',
    },
];

const redirectToDeriv = async (prompt?: string) => {
    const url = await generateOAuthURL(prompt);
    if (url) window.location.replace(url);
    return Boolean(url);
};

const FeatureCarousel = () => {
    const features = React.useMemo(FEATURES, []);
    // Real customer reviews (reviews.ts) replace the tool cards once there are any.
    const reviews: TReview[] = REVIEWS;
    const show_reviews = reviews.length > 0;
    const slide_count = show_reviews ? reviews.length : features.length;
    const slide_labels = show_reviews ? reviews.map(r => r.name) : features.map(f => f.tool);
    const track_ref = React.useRef<HTMLDivElement>(null);
    const [index, setIndex] = React.useState(0);
    const [is_paused, setIsPaused] = React.useState(false);

    const cardWidth = () => {
        const track = track_ref.current;
        const card = track?.firstElementChild as HTMLElement | null;
        if (!track || !card) return 0;
        const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
        return card.offsetWidth + gap;
    };

    const goTo = React.useCallback((next: number) => {
        const track = track_ref.current;
        const width = cardWidth();
        if (!track || !width) return;
        const max_index = Math.max(0, Math.round((track.scrollWidth - track.clientWidth) / width));
        const target = next > max_index ? 0 : Math.max(0, next);
        track.scrollTo({ left: target * width, behavior: 'smooth' });
    }, []);

    const onScroll = () => {
        const width = cardWidth();
        if (width) setIndex(Math.round((track_ref.current?.scrollLeft ?? 0) / width));
    };

    React.useEffect(() => {
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        if (is_paused || reduce) return undefined;
        const timer = window.setInterval(() => goTo(index + 1), 5000);
        return () => window.clearInterval(timer);
    }, [index, is_paused, goTo]);

    return (
        <section
            className='vd-landing__inside'
            aria-roledescription='carousel'
            aria-labelledby='vd-landing-inside-title'
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            onFocus={() => setIsPaused(true)}
            onBlur={() => setIsPaused(false)}
        >
            <h2 id='vd-landing-inside-title'>
                {show_reviews ? localize('What traders say') : localize('What’s inside Vindolar')}
            </h2>

            <div className='vd-landing__track' ref={track_ref} onScroll={onScroll}>
                {show_reviews
                    ? reviews.map((review, i) => (
                          <article
                              key={`${review.name}-${i}`}
                              className='vd-landing__card vd-landing__card--review'
                              aria-roledescription='slide'
                              aria-label={`${i + 1} / ${slide_count}`}
                          >
                              <span
                                  className='vd-landing__stars'
                                  role='img'
                                  aria-label={localize('{{rating}} out of 5 stars', {
                                      rating: Math.min(5, Math.max(1, Math.round(review.rating))),
                                  })}
                              >
                                  {Array.from({ length: 5 }, (_, star) => (
                                      <i
                                          key={star}
                                          aria-hidden='true'
                                          className={star < Math.round(review.rating) ? 'is-on' : ''}
                                      >
                                          ★
                                      </i>
                                  ))}
                              </span>
                              <p>“{review.text}”</p>
                              <footer>
                                  <span className='vd-landing__avatar' aria-hidden='true'>
                                      {review.name
                                          .split(/\s+/)
                                          .map(part => part[0])
                                          .join('')
                                          .slice(0, 2)
                                          .toUpperCase()}
                                  </span>
                                  <span>
                                      <strong>{review.name}</strong>
                                      <small>{review.country ?? localize('Vindolar user')}</small>
                                  </span>
                              </footer>
                          </article>
                      ))
                    : features.map((feature, i) => (
                          <article
                              key={feature.tool}
                              className='vd-landing__card'
                              aria-roledescription='slide'
                              aria-label={`${i + 1} / ${slide_count}`}
                          >
                              <p>{feature.text}</p>
                              <footer>
                                  <span className='vd-landing__avatar' aria-hidden='true'>
                                      {feature.icon}
                                  </span>
                                  <span>
                                      <strong>{feature.tool}</strong>
                                      <small>{localize('Vindolar tool')}</small>
                                  </span>
                                  <span className='vd-landing__tag'>{feature.tag}</span>
                              </footer>
                          </article>
                      ))}
            </div>

            <div className='vd-landing__dots'>
                <button
                    type='button'
                    className='vd-landing__arrow'
                    aria-label={localize('Previous')}
                    onClick={() => goTo(index - 1)}
                    disabled={index === 0}
                >
                    ‹
                </button>
                {slide_labels.map((label, i) => (
                    <button
                        key={`${label}-${i}`}
                        type='button'
                        aria-label={label}
                        aria-current={i === index}
                        className={i === index ? 'is-active' : ''}
                        onClick={() => goTo(i)}
                    />
                ))}
                <button
                    type='button'
                    className='vd-landing__arrow'
                    aria-label={localize('Next')}
                    onClick={() => goTo(index + 1)}
                >
                    ›
                </button>
            </div>
        </section>
    );
};

type TLandingProps = {
    /** Visitor chose to look around without an account. */
    onExplore: () => void;
};

/** Public front page, shown to visitors who are not logged in. */
const Landing = ({ onExplore }: TLandingProps) => {
    const [busy, setBusy] = React.useState<'' | 'login' | 'signup'>('');
    const [show_risk, setShowRisk] = React.useState(false);
    const [menu_open, setMenuOpen] = React.useState(false);
    const tools = React.useMemo(TOOLS, []);

    React.useEffect(() => {
        const { overflow } = document.body.style;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = overflow;
        };
    }, []);

    const go = async (kind: 'login' | 'signup') => {
        setBusy(kind);
        try {
            const ok = await redirectToDeriv(kind === 'signup' ? 'registration' : undefined);
            if (!ok) setBusy('');
        } catch {
            setBusy('');
        }
    };

    const openTool = (hash: string) => {
        window.location.hash = hash;
        onExplore();
    };

    const opening = localize('Opening Deriv…');

    return (
        <div className='vd-landing'>
            <header className={`vd-landing__header${menu_open ? ' is-open' : ''}`}>
                <div className='vd-landing__brand'>
                    <span className='vd-landing__brand-name'>Vindolar</span>
                    <span className='vd-landing__brand-powered'>
                        {localize('powered by')} <b>deriv</b>
                    </span>
                </div>
                <nav className='vd-landing__nav' aria-label={localize('Main')}>
                    <button type='button' onClick={onExplore}>
                        {localize('Explore tools')}
                    </button>
                    <button
                        type='button'
                        onClick={() => {
                            setMenuOpen(false);
                            document.getElementById('vd-landing-tools')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                    >
                        {localize('What’s inside')}
                    </button>
                </nav>
                <div className='vd-landing__actions'>
                    <button
                        type='button'
                        className='vd-landing__btn vd-landing__btn--outline'
                        onClick={() => go('login')}
                        disabled={!!busy}
                    >
                        {busy === 'login' ? opening : localize('Log In')}
                    </button>
                    <button
                        type='button'
                        className='vd-landing__btn vd-landing__btn--orange'
                        onClick={() => go('signup')}
                        disabled={!!busy}
                    >
                        {busy === 'signup' ? opening : localize('Get Started')}
                    </button>
                </div>
                <button
                    type='button'
                    className='vd-landing__menu'
                    aria-label={localize('Open menu')}
                    aria-expanded={menu_open}
                    onClick={() => setMenuOpen(open => !open)}
                >
                    <span />
                    <span />
                    <span />
                </button>
            </header>

            <MarketTicker />

            <main>
                <section className='vd-landing__hero' aria-labelledby='vd-landing-title'>
                    <div
                        className='vd-landing__scene'
                        aria-hidden='true'
                        style={{ backgroundImage: "url('/vindolar-scene.svg')" }}
                    />
                    <div className='vd-landing__hero-content'>
                        <h1 id='vd-landing-title'>{localize('Bots you can test before you trust')}</h1>
                        <p className='vd-landing__subtitle'>
                            {localize(
                                'Build a bot without code, check it on real tick history and run it with a stop loss that cannot be skipped.'
                            )}
                        </p>
                        <div className='vd-landing__ctas'>
                            <button
                                type='button'
                                className='vd-landing__btn vd-landing__btn--orange vd-landing__btn--hero'
                                onClick={() => go('login')}
                                disabled={!!busy}
                            >
                                <span aria-hidden='true'>⌁</span>
                                {busy === 'login' ? opening : localize('Log In and Trade')}
                                <span aria-hidden='true'>›</span>
                            </button>
                            <button
                                type='button'
                                className='vd-landing__btn vd-landing__btn--dark vd-landing__btn--hero'
                                onClick={() => go('signup')}
                                disabled={!!busy}
                            >
                                <span aria-hidden='true'>ϟ</span>
                                {busy === 'signup' ? opening : localize('Create Free Account')}
                            </button>
                        </div>
                        <button type='button' className='vd-landing__explore' onClick={onExplore}>
                            {localize('Just looking?')}{' '}
                            <strong>{localize('Explore the tools without an account')}</strong>
                            <span aria-hidden='true'>›</span>
                        </button>
                    </div>

                    <FeatureCarousel />
                </section>

                <section className='vd-landing__tools' id='vd-landing-tools' aria-labelledby='vd-landing-tools-title'>
                    <div className='vd-landing__section-heading'>
                        <span aria-hidden='true'>♢</span>
                        <h2 id='vd-landing-tools-title'>{localize('EVERYTHING IN ONE WORKSPACE — FREE TO USE')}</h2>
                    </div>
                    <div className='vd-landing__grid'>
                        {tools.map(tool => (
                            <button
                                key={tool.hash}
                                type='button'
                                className='vd-landing__tool'
                                onClick={() => openTool(tool.hash)}
                            >
                                <span className='vd-landing__tool-icon' aria-hidden='true'>
                                    {tool.icon}
                                </span>
                                <strong>{tool.title}</strong>
                                <span>{tool.text}</span>
                            </button>
                        ))}
                    </div>
                </section>
            </main>

            <button type='button' className='vd-landing__risk' aria-haspopup='dialog' onClick={() => setShowRisk(true)}>
                <span aria-hidden='true'>▲</span>
                {localize('Risk Disclaimer')}
            </button>

            {show_risk && <RiskDialog onClose={() => setShowRisk(false)} />}
        </div>
    );
};

export default Landing;
