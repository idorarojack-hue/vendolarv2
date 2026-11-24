import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { publishLiveBalance } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import { useLogout } from '@/hooks/useLogout';
import { useStore } from '@/hooks/useStore';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { OAuthTokenExchangeService } from '@/services/oauth-token-exchange.service';
import { isDemoAccount } from '@/utils/account-helpers';
import { Localize, localize } from '@deriv-com/translations';
import { TAccountSwitcher } from './common/types';
import AccountInfoWrapper from './account-info-wrapper';
import './account-switcher.scss';

const CURRENCY_NAME: Record<string, string> = {
    USD: 'US Dollar',
    EUR: 'Euro',
    GBP: 'Pound Sterling',
    AUD: 'Australian Dollar',
    KES: 'Kenyan Shilling',
    KSH: 'Kenyan Shilling',
    BTC: 'Bitcoin',
    ETH: 'Ethereum',
    USDT: 'Tether',
    LTC: 'Litecoin',
};

const FlagMark = ({ code }: { code: string }) => {
    if (code === 'USD') {
        const stripe = 42 / 13;
        return (
            <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
                {Array.from({ length: 13 }, (_, i) => (
                    <rect key={i} y={i * stripe} width='60' height={stripe + 0.2} fill={i % 2 ? '#fff' : '#b22234'} />
                ))}
                <rect width='26' height={stripe * 7} fill='#3c3b6e' />
                {Array.from({ length: 9 }, (_, i) => (
                    <circle key={i} cx={4 + (i % 3) * 8} cy={3.2 + Math.floor(i / 3) * 4.6} r='1.1' fill='#fff' />
                ))}
            </svg>
        );
    }
    if (code === 'EUR') {
        return (
            <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
                <rect width='60' height='42' fill='#003399' />
                <circle cx='30' cy='21' r='8' fill='none' stroke='#fc0' strokeWidth='1.6' />
            </svg>
        );
    }
    if (code === 'GBP') {
        return (
            <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
                <rect width='60' height='42' fill='#012169' />
                <path d='M0 0 L60 42 M60 0 L0 42' stroke='#fff' strokeWidth='8' />
                <path d='M0 0 L60 42 M60 0 L0 42' stroke='#c8102e' strokeWidth='4' />
                <path d='M30 0 V42 M0 21 H60' stroke='#fff' strokeWidth='12' />
                <path d='M30 0 V42 M0 21 H60' stroke='#c8102e' strokeWidth='7' />
            </svg>
        );
    }
    if (code === 'KES' || code === 'KSH') {
        return (
            <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
                <rect width='60' height='14' fill='#000' />
                <rect y='14' width='60' height='14' fill='#bb0000' />
                <rect y='28' width='60' height='14' fill='#006600' />
                <rect y='12' width='60' height='2' fill='#fff' />
                <rect y='28' width='60' height='2' fill='#fff' />
            </svg>
        );
    }
    return (
        <svg className='acc-flag' viewBox='0 0 60 42' aria-hidden='true'>
            <rect width='60' height='42' fill='#1d4ed8' />
            <text x='30' y='26' textAnchor='middle' fill='#fff' fontSize='12' fontWeight='700'>
                {code.slice(0, 3)}
            </text>
        </svg>
    );
};

const TRADERS_HUB_URL = 'https://app.deriv.com/';
const DISPLAY_CURRENCY_KEY = 'vd_display_currency';
const KSH = 'KSH';
const RATE_URL = 'https://open.er-api.com/v6/latest/USD';

const AccountSwitcher = observer(({ activeAccount }: TAccountSwitcher) => {
    const [isOpen, setIsOpen] = useState(false);
    const [accountTab, setAccountTab] = useState<'real' | 'demo'>('real');
    const [displayCurrency, setDisplayCurrency] = useState(() => localStorage.getItem(DISPLAY_CURRENCY_KEY) || '');
    const [kesPerUsd, setKesPerUsd] = useState<number | null>(null);
    const [reset, setReset] = useState<{ busy: boolean; tone?: 'ok' | 'error'; text?: string }>({ busy: false });
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { accountList, activeLoginid } = useApiBase();
    const { client, run_panel } = useStore() ?? {};
    const handleLogout = useLogout();

    const is_bot_running = run_panel?.is_running || api_base.is_running;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    // Desktop and tablet: the menu hangs under the balance. Where the balance sits near a screen
    // edge (it moves to the left on tablets), slide the menu so it stays fully on screen.
    useLayoutEffect(() => {
        const el = dropdownRef.current;
        if (!isOpen || !el || window.matchMedia('(max-width: 767px)').matches) return;
        el.style.setProperty('--acc-shift', '0px');
        const rect = el.getBoundingClientRect();
        const margin = 8;
        let shift = 0;
        if (rect.left < margin) shift = margin - rect.left;
        else if (rect.right > window.innerWidth - margin) shift = window.innerWidth - margin - rect.right;
        el.style.setProperty('--acc-shift', `${shift}px`);
    }, [isOpen]);

    // On phones the menu is a bottom sheet: keep the page behind it from scrolling.
    useEffect(() => {
        if (!isOpen || !window.matchMedia('(max-width: 767px)').matches) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previous;
        };
    }, [isOpen]);

    useEffect(() => {
        let cancelled = false;
        fetch(RATE_URL)
            .then(response => response.json())
            .then(data => {
                const rate = Number(data?.rates?.KES);
                if (!cancelled && data?.result === 'success' && rate > 0) setKesPerUsd(rate);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);

    const formattedAccounts = useMemo(() => {
        if (!accountList) return [];
        return accountList
            .map(account => {
                const raw = Number(account.balance ?? 0);
                return {
                    loginid: account.loginid,
                    currency: account.currency,
                    raw,
                    balance: addComma(raw.toFixed(getDecimalPlaces(account.currency))),
                    isVirtual: isDemoAccount(account.loginid),
                    isActive: account.loginid === activeLoginid,
                };
            })
            .sort((a, b) => (a.isActive ? -1 : b.isActive ? 1 : 0));
    }, [accountList, activeLoginid]);

    const toggleDropdown = useCallback(() => {
        if (is_bot_running) return;
        setIsOpen(prev => {
            if (!prev) {
                const active = formattedAccounts.find(account => account.isActive);
                if (active) setAccountTab(active.isVirtual ? 'demo' : 'real');
            }
            return !prev;
        });
    }, [formattedAccounts, is_bot_running]);

    const chooseDisplayCurrency = (code: string) => {
        setDisplayCurrency(code);
        localStorage.setItem(DISPLAY_CURRENCY_KEY, code);
    };

    // Demo only: Deriv's reset-demo-balance endpoint puts the demo account back to 10,000 USD.
    const resetDemoBalance = async (loginid: string) => {
        if (reset.busy) return;
        const token = OAuthTokenExchangeService.getAccessToken();
        if (!token) {
            setReset({ busy: false, tone: 'error', text: localize('Please log in again to reset the demo balance.') });
            return;
        }
        setReset({ busy: true });
        try {
            await DerivWSAccountsService.resetDemoBalance(token, loginid);
            setReset({ busy: false, tone: 'ok', text: localize('Demo balance reset.') });
        } catch (e: any) {
            setReset({
                busy: false,
                tone: 'error',
                text: e?.message ?? localize('The demo balance could not be reset.'),
            });
            return;
        }
        // Show the new balance right away; the balance stream also catches up on its own.
        try {
            const response: any = await api_base.api?.send({ balance: 1 });
            const amount = Number(response?.balance?.balance);
            if (Number.isFinite(amount)) {
                client?.setBalance(amount.toString());
                publishLiveBalance(loginid, amount);
            }
        } catch {
            // The stream will deliver the balance.
        }
    };

    const handleAccountSelect = useCallback(
        (loginid: string) => {
            localStorage.setItem('active_loginid', loginid);
            client?.checkAndRegenerateWebSocket();
            setIsOpen(false);
        },
        [client]
    );

    const streamedBalance = Number(client?.balance);
    const activeSnapshot = formattedAccounts.find(account => account.isActive);
    const canUseStream =
        Number.isFinite(streamedBalance) &&
        (!client?.loginid || client.loginid === activeLoginid) &&
        !(streamedBalance === 0 && (activeSnapshot?.raw ?? 0) > 0);
    const displayedAccounts = canUseStream
        ? formattedAccounts.map(account =>
              account.isActive
                  ? {
                        ...account,
                        raw: streamedBalance,
                        balance: addComma(streamedBalance.toFixed(getDecimalPlaces(account.currency))),
                    }
                  : account
          )
        : formattedAccounts;

    const visibleAccounts = displayedAccounts.filter(account => account.isVirtual === (accountTab === 'demo'));
    const accountCurrencies = Array.from(
        new Set(visibleAccounts.map(account => getCurrencyDisplayCode(account.currency || '')))
    ).filter(Boolean);
    const currencies =
        accountCurrencies.includes(KSH) || accountCurrencies.includes('KES')
            ? accountCurrencies
            : [...accountCurrencies, KSH];
    const selectedCurrency = currencies.includes(displayCurrency) ? displayCurrency : accountCurrencies[0] || '';
    const showingShillings = selectedCurrency === KSH && !accountCurrencies.includes(KSH);
    const listedAccounts = showingShillings
        ? visibleAccounts
        : visibleAccounts.filter(account => getCurrencyDisplayCode(account.currency || '') === selectedCurrency);

    const asShillings = (amount: number) => (kesPerUsd ? addComma((amount * kesPerUsd).toFixed(2)) : '');

    if (!activeAccount) return null;

    const { currency, balance } = activeAccount;
    const currencyCode = getCurrencyDisplayCode(currency || '');
    const liveAccount = displayedAccounts.find(account => account.isActive);
    const shownBalance =
        showingShillings && liveAccount && kesPerUsd
            ? `${asShillings(liveAccount.raw)} ${KSH}`
            : `${liveAccount?.balance || balance} ${currencyCode}`;
    const headerFlag = showingShillings ? KSH : currencyCode;
    const showChevron = !is_bot_running;

    return (
        <div className='acc-info__wrapper' ref={wrapperRef}>
            <AccountInfoWrapper>
                <div
                    data-testid='dt_acc_info'
                    id='dt_core_account-info_acc-info'
                    role={showChevron ? 'button' : undefined}
                    tabIndex={showChevron ? 0 : -1}
                    aria-expanded={showChevron ? isOpen : undefined}
                    aria-haspopup={showChevron ? 'listbox' : undefined}
                    className={classNames('acc-info', {
                        'acc-info--is-virtual': activeAccount.isVirtual,
                        'acc-info--interactive': showChevron,
                    })}
                    onClick={toggleDropdown}
                    onKeyDown={e => {
                        if (showChevron && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            toggleDropdown();
                        }
                    }}
                >
                    <span className='acc-info__flag' aria-hidden='true'>
                        <FlagMark code={headerFlag} />
                    </span>
                    <span className='acc-info__id' aria-hidden='true'></span>
                    <div className='acc-info__content'>
                        {(typeof balance !== 'undefined' || !currency) && (
                            <div className='acc-info__balance-section'>
                                <p
                                    data-testid='dt_balance'
                                    className={classNames('acc-info__balance', {
                                        'acc-info__balance--no-currency': !currency,
                                    })}
                                >
                                    {!currency ? <Localize i18n_default_text='No currency assigned' /> : shownBalance}
                                </p>
                            </div>
                        )}
                    </div>
                    {showChevron && (
                        <span
                            className={classNames('acc-info__select-arrow', {
                                'acc-info__select-arrow--invert': isOpen,
                            })}
                        >
                            <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
                                <path
                                    d='M2 4L6 8L10 4'
                                    stroke='currentColor'
                                    strokeWidth='1.5'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                />
                            </svg>
                        </span>
                    )}
                </div>
            </AccountInfoWrapper>
            {isOpen && (
                <>
                    <button
                        type='button'
                        className='acc-dropdown-backdrop'
                        aria-label={localize('Close')}
                        tabIndex={-1}
                        onClick={() => setIsOpen(false)}
                    />
                    <div className='acc-dropdown' ref={dropdownRef} role='dialog' aria-label={localize('Accounts')}>
                        <div className='acc-dropdown__grip' aria-hidden='true' />
                        <div className='acc-dropdown__head'>
                            <strong>
                                <Localize i18n_default_text='Accounts' />
                            </strong>
                            <button
                                type='button'
                                className='acc-dropdown__close'
                                aria-label={localize('Close')}
                                onClick={() => setIsOpen(false)}
                            >
                                <svg width='14' height='14' viewBox='0 0 14 14' aria-hidden='true'>
                                    <path
                                        d='M2 2l10 10M12 2L2 12'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                        strokeLinecap='round'
                                    />
                                </svg>
                            </button>
                        </div>

                        <div className='acc-dropdown__tabs' role='tablist'>
                            <button
                                type='button'
                                role='tab'
                                aria-selected={accountTab === 'real'}
                                className={classNames({ 'is-active': accountTab === 'real' })}
                                onClick={() => setAccountTab('real')}
                            >
                                <Localize i18n_default_text='Real' />
                            </button>
                            <button
                                type='button'
                                role='tab'
                                aria-selected={accountTab === 'demo'}
                                className={classNames({ 'is-active': accountTab === 'demo' })}
                                onClick={() => setAccountTab('demo')}
                            >
                                <Localize i18n_default_text='Demo' />
                            </button>
                        </div>

                        <p className='acc-dropdown__label'>
                            <Localize i18n_default_text='Display currency' />
                        </p>
                        <div className='acc-dropdown__currencies'>
                            {currencies.map(code => (
                                <button
                                    key={code}
                                    type='button'
                                    aria-pressed={code === selectedCurrency}
                                    className={classNames('acc-dropdown__currency', {
                                        'is-selected': code === selectedCurrency,
                                    })}
                                    onClick={() => chooseDisplayCurrency(code)}
                                >
                                    <span className='acc-dropdown__currency-flag' aria-hidden='true'>
                                        <FlagMark code={code} />
                                    </span>
                                    <span className='acc-dropdown__currency-text'>
                                        <strong>{code}</strong>
                                        <small>{CURRENCY_NAME[code] || code}</small>
                                    </span>
                                </button>
                            ))}
                        </div>
                        {showingShillings && (
                            <p className='acc-dropdown__rate'>
                                {kesPerUsd
                                    ? `1 USD = ${kesPerUsd.toFixed(2)} KSH`
                                    : localize('Fetching the shilling rate…')}
                            </p>
                        )}

                        <p className='acc-dropdown__label'>
                            {accountTab === 'demo' ? (
                                <Localize i18n_default_text='Demo accounts' />
                            ) : (
                                <Localize i18n_default_text='Real accounts' />
                            )}
                        </p>
                        {listedAccounts.length === 0 && (
                            <p className='acc-dropdown__empty'>
                                {accountTab === 'real' ? (
                                    <Localize i18n_default_text='No real account in this currency yet.' />
                                ) : (
                                    <Localize i18n_default_text='No account in this currency.' />
                                )}
                            </p>
                        )}
                        <div className='acc-dropdown__list' role='listbox' aria-label={localize('Deriv accounts')}>
                            {listedAccounts.map(account => (
                                <div
                                    key={account.loginid}
                                    role='option'
                                    aria-selected={account.isActive}
                                    tabIndex={0}
                                    className={classNames('acc-dropdown__account', {
                                        'acc-dropdown__account--selected': account.isActive,
                                    })}
                                    onClick={() => !account.isActive && handleAccountSelect(account.loginid)}
                                    onKeyDown={e => {
                                        if (!account.isActive && (e.key === 'Enter' || e.key === ' ')) {
                                            e.preventDefault();
                                            handleAccountSelect(account.loginid);
                                        }
                                    }}
                                >
                                    <span className='acc-dropdown__flag' aria-hidden='true'>
                                        <FlagMark code={getCurrencyDisplayCode(account.currency || '')} />
                                    </span>
                                    <span className='acc-dropdown__meta'>
                                        <strong>
                                            {getCurrencyDisplayCode(account.currency || '') || localize('No currency')}
                                            <em
                                                className={classNames('acc-dropdown__badge', {
                                                    'acc-dropdown__badge--demo': account.isVirtual,
                                                })}
                                            >
                                                {account.isVirtual ? localize('Demo') : localize('Real')}
                                            </em>
                                        </strong>
                                        <small>{account.loginid}</small>
                                    </span>
                                    <span className='acc-dropdown__amount'>
                                        {showingShillings
                                            ? kesPerUsd
                                                ? `${asShillings(account.raw)} ${KSH}`
                                                : localize('Fetching rate…')
                                            : `${account.balance} ${getCurrencyDisplayCode(account.currency || '')}`}
                                        {account.isActive && <small>{localize('Active')}</small>}
                                    </span>
                                    {account.isVirtual && account.isActive && (
                                        <button
                                            type='button'
                                            className='acc-dropdown__reset'
                                            disabled={reset.busy}
                                            onClick={e => {
                                                e.stopPropagation();
                                                resetDemoBalance(account.loginid);
                                            }}
                                            onKeyDown={e => e.stopPropagation()}
                                        >
                                            <svg width='14' height='14' viewBox='0 0 16 16' aria-hidden='true'>
                                                <path
                                                    d='M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3.5H10'
                                                    fill='none'
                                                    stroke='currentColor'
                                                    strokeWidth='1.6'
                                                    strokeLinecap='round'
                                                    strokeLinejoin='round'
                                                />
                                            </svg>
                                            {reset.busy
                                                ? localize('Resetting…')
                                                : localize('Reset balance to 10,000 USD')}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {accountTab === 'demo' && reset.text && (
                            <p
                                className={classNames(
                                    'acc-dropdown__reset-note',
                                    `acc-dropdown__reset-note--${reset.tone}`
                                )}
                                role='status'
                            >
                                {reset.text}
                            </p>
                        )}

                        <div className='acc-dropdown__footer'>
                            <a
                                className='acc-dropdown__hub'
                                href={TRADERS_HUB_URL}
                                target='_blank'
                                rel='noopener noreferrer'
                                title={localize("Looking for CFD accounts? Go to Trader's Hub")}
                            >
                                <Localize i18n_default_text="CFDs on Trader's Hub" />
                                <span aria-hidden='true'>↗</span>
                            </a>
                            <button type='button' className='acc-dropdown__logout' onClick={() => handleLogout()}>
                                <svg width='16' height='16' viewBox='0 0 16 16' aria-hidden='true'>
                                    <path
                                        d='M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10.5 11l3-3-3-3M13.5 8H6'
                                        fill='none'
                                        stroke='currentColor'
                                        strokeWidth='1.6'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    />
                                </svg>
                                <Localize i18n_default_text='Log out' />
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
});

export default AccountSwitcher;
