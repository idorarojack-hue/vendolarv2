import React, { lazy, Suspense, useEffect, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useLocation, useNavigate } from 'react-router-dom';
import ChunkLoader from '@/components/loader/chunk-loader';
import { generateOAuthURL } from '@/components/shared';
import DesktopWrapper from '@/components/shared_ui/desktop-wrapper';
import Dialog from '@/components/shared_ui/dialog';
import MobileWrapper from '@/components/shared_ui/mobile-wrapper';
import Tabs from '@/components/shared_ui/tabs/tabs';
import TradeTypeConfirmationModal from '@/components/trade-type-confirmation-modal';
import TradingViewModal from '@/components/trading-view-chart/trading-view-modal';
import FloatingScanner from '@/components/vindolar/floating-scanner';
import PulseWindow, { openPulseScanner } from '@/components/vindolar/pulse-window';
import { DBOT_TABS, LAST_TAB_ID, NAV_TABS, TAB_HASHES, TAB_IDS, TNavTabKey } from '@/constants/bot-contents';
import { api_base, updateWorkspaceName } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { isDbotRTL } from '@/external/bot-skeleton/utils/workspace';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import {
    disableUrlParameterApplication,
    enableUrlParameterApplication,
    setupTradeTypeChangeListener,
} from '@/utils/blockly-url-param-handler';
import {
    checkAndShowTradeTypeModal,
    getModalState,
    handleTradeTypeCancel,
    handleTradeTypeConfirm,
    resetUrlParamProcessing,
    setModalStateChangeCallback,
} from '@/utils/trade-type-modal-handler';
import {
    LabelPairedArrowsRotateCaptionRegularIcon,
    LabelPairedBellCaptionRegularIcon,
    LabelPairedChartAreaCaptionRegularIcon,
    LabelPairedChartLineCaptionRegularIcon,
    LabelPairedChartMixedCaptionRegularIcon,
    LabelPairedChartTrendUpCaptionRegularIcon,
    LabelPairedCloneCaptionRegularIcon,
    LabelPairedFileChartColumnCaptionRegularIcon,
    LabelPairedGaugeMaxCaptionRegularIcon,
    LabelPairedGearCaptionRegularIcon,
    LabelPairedGridCaptionRegularIcon,
    LabelPairedHandGestureTapRightCaptionRegularIcon,
    LabelPairedHandsHoldingDiamondCaptionRegularIcon,
    LabelPairedMagnifyingGlassPlusCaptionRegularIcon,
    LabelPairedPuzzlePieceTwoCaptionRegularIcon,
    LabelPairedShieldCheckCaptionRegularIcon,
    LabelPairedSlidersCaptionRegularIcon,
    LabelPairedUsersCaptionRegularIcon,
} from '@deriv/quill-icons/LabelPaired';
import { LegacyGuide1pxIcon } from '@deriv/quill-icons/Legacy';
import { Localize, localize } from '@deriv-com/translations';
import { useDevice } from '@deriv-com/ui';
import RunPanel from '../../components/run-panel';
import ChartModal from '../chart/chart-modal';
import Dashboard from '../dashboard';
import RunStrategy from '../dashboard/run-strategy';
import GlobalStatus from './global-status';
import TickerUnderTabs from './ticker-under-tabs';
import './main.scss';

const ChartWrapper = lazy(() => import('../chart/chart-wrapper'));
const Tutorial = lazy(() => import('../tutorials'));
// Vindolar tools (loaded only when their tab is opened)
const RecoveryTrader = lazy(() => import('../recovery-trader'));
const FreeBots = lazy(() => import('../free-bots'));
const BulkTrader = lazy(() => import('../bulk-trader'));
const AnalysisTools = lazy(() => import('../analysis-tools'));
const HedgingTool = lazy(() => import('../hedging-tool'));
const AutoStrategies = lazy(() => import('../auto-strategies'));
const ManualTrader = lazy(() => import('../manual-trader'));
const PatternBots = lazy(() => import('../pattern-bots'));
const MarketScanner = lazy(() => import('../market-scanner'));
const QuickBot = lazy(() => import('../quick-bot'));
const Signals = lazy(() => import('../signals'));
const DCircles = lazy(() => import('../dcircles'));
const CopyTrader = lazy(() => import('../copy-trader'));
const SpeedTrader = lazy(() => import('../speed-trader'));
const Automated = lazy(() => import('../automated'));
const StrategyTester = lazy(() => import('../strategy-tester'));
const Reports = lazy(() => import('../reports'));

const NAV_ICON_PROPS = { height: '16px', width: '16px', fill: 'currentColor' };

const withLoader = (page: React.ReactNode) => (
    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading...')} />}>{page}</Suspense>
);

const AppWrapper = observer(() => {
    const { connectionStatus } = useApiBase();
    const { dashboard, load_modal, run_panel, quick_strategy, summary_card, blockly_store } = useStore();
    const { is_loading } = blockly_store;
    const {
        active_tab,
        active_tour,
        is_chart_modal_visible,
        is_trading_view_modal_visible,
        setActiveTab,
        setWebSocketState,
        setActiveTour,
        setTourDialogVisibility,
    } = dashboard;
    const { dashboard_strategies } = load_modal;
    const {
        is_dialog_open,
        is_drawer_open,
        dialog_options,
        onCancelButtonClick,
        onCloseDialog,
        onOkButtonClick,
        stopBot,
    } = run_panel;
    const { is_open } = quick_strategy;
    const { cancel_button_text, ok_button_text, title, message, dismissable, is_closed_on_cancel } = dialog_options as {
        [key: string]: string;
    };
    const { clear } = summary_card;
    const { DASHBOARD, BOT_BUILDER } = DBOT_TABS;
    const init_render = React.useRef(true);
    // Url hash per tab, in tab order (see NAV_TABS in constants/bot-contents.ts)
    const hash = TAB_HASHES;
    const { isDesktop } = useDevice();
    const location = useLocation();
    const navigate = useNavigate();
    const [left_tab_shadow, setLeftTabShadow] = useState<boolean>(false);
    const [right_tab_shadow, setRightTabShadow] = useState<boolean>(false);

    // Trade type modal state
    const [tradeTypeModalState, setTradeTypeModalState] = useState(getModalState());

    /**
     * Helper function to get modal props with enhanced type safety and clear documentation
     *
     * Props serve distinct purposes:
     * - current_trade_type: Technical identifier for API/internal use (format: "category/type")
     * - current_trade_type_display_name: Human-readable name for UI display
     *
     * This separation ensures proper data flow between technical systems and user interface
     */
    const getTradeTypeModalProps = () => {
        const { tradeTypeData } = tradeTypeModalState;

        return {
            is_visible: tradeTypeModalState.isVisible,
            trade_type_display_name: tradeTypeData?.displayName || '',

            // Technical identifier for internal/API use (e.g., "callput/callput")
            // Used by backend systems and technical integrations
            current_trade_type: tradeTypeData?.currentTradeType
                ? `${tradeTypeData.currentTradeType.tradeTypeCategory}/${tradeTypeData.currentTradeType.tradeType}`
                : 'N/A',

            // Human-readable display name for UI (e.g., "Rise/Fall")
            // Used for user-facing text and modal content
            current_trade_type_display_name: tradeTypeData?.currentTradeTypeDisplayName || 'N/A',

            onConfirm: handleTradeTypeConfirm,
            onCancel: handleTradeTypeCancel,
        };
    };

    let tab_value: number | string = active_tab;
    const GetHashedValue = (tab: number) => {
        tab_value = location.hash?.split('#')[1];
        if (!tab_value) return tab;
        const index = hash.indexOf(String(tab_value));
        // Unknown hash (e.g. an old bookmark): stay on the current tab instead of an invalid index.
        return index >= 0 ? index : tab;
    };
    const active_hash_tab = GetHashedValue(active_tab);

    // Set up modal state change listener
    React.useEffect(() => {
        setModalStateChangeCallback(new_state => {
            setTradeTypeModalState(new_state);
        });
    }, [is_loading]);

    // Reset URL parameter processing when location changes
    React.useEffect(() => {
        resetUrlParamProcessing();
    }, [location.search]);

    // Keep the active tab visible in the (horizontally scrolling) tab strip.
    React.useEffect(() => {
        const frame = requestAnimationFrame(() => {
            const strip = document.querySelector<HTMLElement>('.dc-tabs__list--main__tabs');
            const tab = strip?.querySelectorAll<HTMLElement>('.dc-tabs__item--main__tabs')[active_tab];
            if (!strip || !tab) return;
            const strip_rect = strip.getBoundingClientRect();
            const tab_rect = tab.getBoundingClientRect();
            const left = strip.scrollLeft + tab_rect.left - strip_rect.left - strip_rect.width / 2 + tab_rect.width / 2;
            strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
        });
        return () => cancelAnimationFrame(frame);
    }, [active_tab]);

    // The Pulse AI Scanner lives in a floating window now. Anything that opens its old tab
    // (tool cards, #market_scanner links, the status bar) opens the window and stays on the last tab.
    const previous_tab = React.useRef(DBOT_TABS.DASHBOARD);
    React.useEffect(() => {
        if (active_tab === DBOT_TABS.MARKET_SCANNER) {
            openPulseScanner();
            setActiveTab(previous_tab.current);
            return;
        }
        previous_tab.current = active_tab;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active_tab]);

    // Follow the url hash (links, browser back/forward, typed urls): open the tab it names.
    React.useEffect(() => {
        if (init_render.current) return;
        const index = TAB_HASHES.indexOf(location.hash.replace('#', ''));
        if (index >= 0 && index !== active_tab) setActiveTab(index);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.hash]);

    React.useEffect(() => {
        const el_dashboard = document.getElementById('id-dbot-dashboard');
        // Right-hand scroll shadow tracks whichever tab is last in the bar.
        const el_tutorial = document.getElementById(LAST_TAB_ID);

        const observer_dashboard = new window.IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setLeftTabShadow(false);
                    return;
                }
                setLeftTabShadow(true);
            },
            {
                root: null,
                threshold: 0.5, // set offset 0.1 means trigger if atleast 10% of element in viewport
            }
        );

        const observer_tutorial = new window.IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setRightTabShadow(false);
                    return;
                }
                setRightTabShadow(true);
            },
            {
                root: null,
                threshold: 0.5, // set offset 0.1 means trigger if atleast 10% of element in viewport
            }
        );
        observer_dashboard.observe(el_dashboard);
        observer_tutorial.observe(el_tutorial);
    });

    React.useEffect(() => {
        if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            const is_bot_running = document.getElementById('db-animation__stop-button') !== null;
            if (is_bot_running) {
                clear();
                stopBot();
                api_base.setIsRunning(false);
                setWebSocketState(false);
            }
        }
    }, [clear, connectionStatus, setWebSocketState, stopBot]);

    // Update tab shadows height to match bot builder height
    const updateTabShadowsHeight = () => {
        const botBuilderEl = document.getElementById('id-bot-builder');
        const leftShadow = document.querySelector('.tabs-shadow--left') as HTMLElement;
        const rightShadow = document.querySelector('.tabs-shadow--right') as HTMLElement;

        if (botBuilderEl && leftShadow && rightShadow) {
            const height = botBuilderEl.offsetHeight;
            leftShadow.style.height = `${height}px`;
            rightShadow.style.height = `${height}px`;
        }
    };

    React.useEffect(() => {
        let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

        // Handle URL trade type parameters when switching to Bot Builder tab
        if (active_tab === BOT_BUILDER) {
            // Use requestAnimationFrame to ensure Blockly workspace is fully initialized
            requestAnimationFrame(() => {
                // Disable automatic URL parameter application to prevent changes before modal
                disableUrlParameterApplication();

                // Set up listener for manual trade type changes (only once)
                setupTradeTypeChangeListener();

                // Create unified handler for both immediate and delayed execution
                const handleTradeTypeModal = () => {
                    checkAndShowTradeTypeModal(
                        // onConfirm: Changes are now handled by the modal component
                        () => {
                            // Re-enable URL parameter application for future parameters
                            enableUrlParameterApplication();
                        },
                        // onCancel: URL parameter removal is now handled by the modal component
                        () => {}
                    );
                };

                // Wait for Blockly to finish loading before checking for URL parameters
                if (!blockly_store.is_loading) {
                    // Blockly is loaded, but add longer delay to ensure workspace is fully initialized
                    // and trade type fields are populated
                    setTimeout(() => {
                        handleTradeTypeModal();
                    }, 500);
                } else {
                    // Blockly is still loading, wait for it to finish with optimized polling
                    let pollAttempts = 0;
                    const maxPollAttempts = 10; // Maximum 5 seconds (10 * 500ms) - optimized performance

                    const checkBlocklyLoaded = () => {
                        if (!blockly_store.is_loading) {
                            handleTradeTypeModal();
                            return; // Exit polling once loaded
                        }

                        if (pollAttempts < maxPollAttempts) {
                            pollAttempts++;
                            // Use 500ms intervals for better performance (5x improvement from 100ms)
                            pollTimeoutId = setTimeout(checkBlocklyLoaded, 500);
                        } else {
                            console.warn(
                                'Blockly loading timeout after 5 seconds - proceeding without URL parameter check'
                            );
                        }
                    };

                    checkBlocklyLoaded();
                }
            });
        }

        // Cleanup function to prevent memory leaks
        return () => {
            if (pollTimeoutId) {
                clearTimeout(pollTimeoutId);
                pollTimeoutId = null;
            }
        };
    }, [active_tab, is_loading]);

    React.useEffect(() => {
        // Run on mount and when active tab changes
        updateTabShadowsHeight();

        if (is_open) {
            setTourDialogVisibility(false);
        }
        if (init_render.current) {
            setActiveTab(Number(active_hash_tab));
            if (!isDesktop) handleTabChange(Number(active_hash_tab));
            init_render.current = false;
        } else {
            // Preserve URL parameters when navigating
            const currentSearch = window.location.search;
            navigate(`${currentSearch}#${hash[active_tab] || hash[0]}`);
        }
        if (active_tour !== '') {
            setActiveTour('');
        }

        // Prevent scrolling when tutorial tab is active (only on mobile)
        const mainElement = document.querySelector('.main__container');
        if (active_tab === DBOT_TABS.TUTORIAL && !isDesktop) {
            document.body.style.overflow = 'hidden';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.add('no-scroll');
            }
        } else {
            document.body.style.overflow = '';
            if (mainElement instanceof HTMLElement) {
                mainElement.classList.remove('no-scroll');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active_tab]);

    React.useEffect(() => {
        const trashcan_init_id = setTimeout(() => {
            if (active_tab === BOT_BUILDER && Blockly?.derivWorkspace?.trashcan) {
                const trashcanY = window.innerHeight - 250;
                let trashcanX;
                if (is_drawer_open) {
                    trashcanX = isDbotRTL() ? 380 : window.innerWidth - 460;
                } else {
                    trashcanX = isDbotRTL() ? 20 : window.innerWidth - 100;
                }
                Blockly?.derivWorkspace?.trashcan?.setTrashcanPosition(trashcanX, trashcanY);
            }
        }, 100);

        return () => {
            clearTimeout(trashcan_init_id); // Clear the timeout on unmount
        };
        //eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active_tab, is_drawer_open]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>;
        if (dashboard_strategies.length > 0) {
            // Needed to pass this to the Callback Queue as on tab changes
            // document title getting override by 'Bot | Deriv' only
            timer = setTimeout(() => {
                updateWorkspaceName();
            });
        }
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [dashboard_strategies, active_tab]);

    const handleTabChange = React.useCallback(
        (tab_index: number) => {
            setActiveTab(tab_index);
            const el_id = TAB_IDS[tab_index];
            if (el_id) {
                const el_tab = document.getElementById(el_id);
                setTimeout(() => {
                    el_tab?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                }, 10);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [active_tab]
    );

    // [AI]
    const handleLoginGeneration = async () => {
        const oauthUrl = await generateOAuthURL();
        if (oauthUrl) {
            window.location.replace(oauthUrl);
        } else {
            console.error('Failed to generate OAuth URL');
        }
    };
    // [/AI]

    // The Run button / run panel belong to the Bot Builder bot. Show them only on tabs where that bot is
    // relevant, so users don't think "Run" starts the tool on screen. While a bot runs, keep them everywhere.
    const BOT_CONTEXT_TABS = [
        DBOT_TABS.DASHBOARD,
        DBOT_TABS.BOT_BUILDER,
        DBOT_TABS.CHART,
        DBOT_TABS.FREE_BOTS,
        DBOT_TABS.QUICK_BOT,
        DBOT_TABS.TUTORIAL,
    ];
    const show_bot_controls = BOT_CONTEXT_TABS.includes(active_tab) || run_panel.is_running || Boolean(active_tour);

    // Icon and content for every tab in NAV_TABS (order and labels live in constants/bot-contents.ts).
    const tab_pages: Record<TNavTabKey, { icon: React.ReactNode; content?: React.ReactNode; id?: string }> = {
        DASHBOARD: {
            icon: <LabelPairedGridCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: <Dashboard handleTabChange={handleTabChange} />,
        },
        // The Blockly workspace is rendered outside the tabs and shown when this tab is active.
        BOT_BUILDER: { icon: <LabelPairedPuzzlePieceTwoCaptionRegularIcon {...NAV_ICON_PROPS} /> },
        RECOVERY_TRADER: {
            icon: <LabelPairedArrowsRotateCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<RecoveryTrader />),
        },
        FREE_BOTS: {
            icon: <LabelPairedGridCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<FreeBots />),
        },
        BULK_TRADER: {
            icon: <LabelPairedCloneCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<BulkTrader />),
        },
        ANALYSIS_TOOLS: {
            icon: <LabelPairedChartMixedCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<AnalysisTools />),
        },
        STRATEGY_TESTER: {
            icon: <LabelPairedChartAreaCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<StrategyTester />),
        },
        REPORTS: {
            icon: <LabelPairedFileChartColumnCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<Reports />),
        },
        HEDGING_TOOL: {
            icon: <LabelPairedShieldCheckCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<HedgingTool />),
        },
        AUTO_STRATEGIES: {
            icon: <LabelPairedChartTrendUpCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<AutoStrategies />),
        },
        MANUAL_TRADER: {
            icon: <LabelPairedHandGestureTapRightCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<ManualTrader />),
        },
        PATTERN_BOTS: {
            icon: <LabelPairedHandsHoldingDiamondCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<PatternBots />),
        },
        MARKET_SCANNER: {
            icon: <LabelPairedMagnifyingGlassPlusCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<MarketScanner />),
        },
        QUICK_BOT: {
            icon: <LabelPairedSlidersCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<QuickBot />),
        },
        SIGNALS: { icon: <LabelPairedBellCaptionRegularIcon {...NAV_ICON_PROPS} />, content: withLoader(<Signals />) },
        DCIRCLES: {
            icon: (
                <svg width='16' height='16' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
                    <circle cx='8' cy='8' r='6.2' stroke='currentColor' strokeWidth='1.5' />
                    <path
                        d='M8 1.8a6.2 6.2 0 0 1 6.2 6.2'
                        stroke='currentColor'
                        strokeWidth='2.4'
                        strokeLinecap='round'
                    />
                    <circle cx='8' cy='8' r='1.6' fill='currentColor' />
                </svg>
            ),
            content: withLoader(<DCircles />),
        },
        COPY_TRADER: {
            icon: <LabelPairedUsersCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<CopyTrader />),
        },
        SPEED_TRADER: {
            icon: <LabelPairedGaugeMaxCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<SpeedTrader />),
        },
        AUTOMATED: {
            icon: <LabelPairedGearCaptionRegularIcon {...NAV_ICON_PROPS} />,
            content: withLoader(<Automated />),
        },
        CHART: {
            icon: <LabelPairedChartLineCaptionRegularIcon {...NAV_ICON_PROPS} />,
            id: is_chart_modal_visible || is_trading_view_modal_visible ? 'id-charts--disabled' : 'id-charts',
            content: (
                <Suspense fallback={<ChunkLoader message={localize('Please wait, loading chart...')} />}>
                    <ChartWrapper show_digits_stats={false} />
                </Suspense>
            ),
        },
        TUTORIAL: {
            icon: <LegacyGuide1pxIcon height='16px' width='16px' fill='currentColor' />,
            content: (
                <div className='tutorials-wrapper'>
                    <Suspense fallback={<ChunkLoader message={localize('Please wait, loading tutorials...')} />}>
                        <Tutorial handleTabChange={handleTabChange} />
                    </Suspense>
                </div>
            ),
        },
    };

    return (
        <React.Fragment>
            <div
                className={classNames('main', {
                    // Tool tabs make room for the open run panel (Bot Builder and Chart handle it themselves).
                    'main--run-panel-open':
                        isDesktop && is_drawer_open && ![DBOT_TABS.BOT_BUILDER, DBOT_TABS.CHART].includes(active_tab),
                })}
            >
                <div
                    className={classNames('main__container', {
                        'main__container--active': active_tour && active_tab === DASHBOARD && !isDesktop,
                    })}
                >
                    <div>
                        {!isDesktop && left_tab_shadow && <span className='tabs-shadow tabs-shadow--left' />}{' '}
                        <Tabs active_index={active_tab} className='main__tabs' onTabItemClick={handleTabChange} top>
                            {NAV_TABS.map(tab => {
                                const page = tab_pages[tab.key];
                                return (
                                    <div
                                        key={tab.key}
                                        label={
                                            <span className='vd-nav-label'>
                                                {page.icon}
                                                <Localize i18n_default_text={tab.label} />
                                                {tab.key === 'AUTO_STRATEGIES' && (
                                                    <span className='vd-nav-badge'>{localize('new')}</span>
                                                )}
                                            </span>
                                        }
                                        id={page.id ?? tab.id}
                                    >
                                        {page.content}
                                    </div>
                                );
                            })}
                        </Tabs>
                        <TickerUnderTabs />
                        {!isDesktop && right_tab_shadow && <span className='tabs-shadow tabs-shadow--right' />}{' '}
                    </div>
                </div>
            </div>
            <DesktopWrapper>
                <div className={classNames('main__run-strategy-wrapper', { 'vd-hidden': !show_bot_controls })}>
                    <RunStrategy />
                </div>
                {/*
                 * The run panel (Summary / Transactions / Journal) must not live inside the Run bar:
                 * the bar is centred with a CSS transform, which traps fixed-position children, and the
                 * panel ended up below the bottom of the screen — Run worked but showed nothing.
                 * It is on every tab: it also lists the trades placed from the tools, and its Reset clears them.
                 */}
                <div className={classNames('vd-run-panel-slot', { 'vd-run-panel-slot--tools': !show_bot_controls })}>
                    <RunPanel />
                </div>
                <ChartModal />
                <TradingViewModal />
            </DesktopWrapper>
            <MobileWrapper>
                {/* On tool tabs the panel stays, without the bot's Run controls. */}
                <div className={classNames('vd-run-panel-slot', { 'vd-run-panel-slot--tools': !show_bot_controls })}>
                    {!is_open && <RunPanel hide_run_controls={!show_bot_controls} />}
                </div>
            </MobileWrapper>
            <GlobalStatus has_bot_bar={show_bot_controls} />
            <FloatingScanner lifted={show_bot_controls} beside_drawer={isDesktop && is_drawer_open} />
            <PulseWindow />
            <Dialog
                cancel_button_text={cancel_button_text || localize('Cancel')}
                className='dc-dialog__wrapper--fixed'
                confirm_button_text={ok_button_text || localize('Ok')}
                has_close_icon
                is_mobile_full_width={false}
                is_visible={is_dialog_open}
                onCancel={onCancelButtonClick}
                onClose={onCloseDialog}
                onConfirm={onOkButtonClick || onCloseDialog}
                portal_element_id='modal_root'
                title={title}
                login={handleLoginGeneration}
                dismissable={dismissable} // Prevents closing on outside clicks
                is_closed_on_cancel={is_closed_on_cancel}
            >
                {message}
            </Dialog>

            {/* Trade Type Confirmation Modal */}
            {(() => {
                const modalProps = getTradeTypeModalProps();
                return (
                    <TradeTypeConfirmationModal
                        is_visible={modalProps.is_visible}
                        trade_type_display_name={modalProps.trade_type_display_name}
                        current_trade_type={modalProps.current_trade_type}
                        current_trade_type_display_name={modalProps.current_trade_type_display_name}
                        onConfirm={modalProps.onConfirm}
                        onCancel={modalProps.onCancel}
                    />
                );
            })()}
        </React.Fragment>
    );
});

export default AppWrapper;
