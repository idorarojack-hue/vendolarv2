/**
 * Reads a Deriv Bot file (.xml, as saved by the Bot Builder or Deriv Bot) that the site owner
 * uploads: checks it, and fills in a name, market and contract from its blocks.
 */
import { checkBotFileXml } from './free-bots-schema';

export type TBotFile = {
    file_name: string;
    xml: string;
    name: string;
    market_label: string;
    contract_label: string;
    /** Why the file can't be used (empty when it can). */
    problems: string[];
    /** Things to check before publishing (the file can still be used). */
    warnings: string[];
};

const TRADE_TYPES: Record<string, string> = {
    callput: 'Rise/Fall',
    callputequal: 'Rise/Fall (equals)',
    higherlower: 'Higher/Lower',
    touchnotouch: 'Touch/No Touch',
    endsinout: 'Ends Between/Outside',
    staysinout: 'Stays Between/Goes Outside',
    asians: 'Asians',
    evenodd: 'Even/Odd',
    overunder: 'Over/Under',
    matchesdiffers: 'Matches/Differs',
    highlowticks: 'High/Low Ticks',
    runs: 'Only Ups/Only Downs',
    reset: 'Reset Call/Put',
    accumulator: 'Accumulators',
    multiplier: 'Multipliers',
};

const PURCHASES: Record<string, string> = {
    CALL: 'Rise',
    PUT: 'Fall',
    CALLE: 'Rise',
    PUTE: 'Fall',
    DIGITEVEN: 'Even',
    DIGITODD: 'Odd',
    DIGITOVER: 'Over',
    DIGITUNDER: 'Under',
    DIGITMATCH: 'Matches',
    DIGITDIFF: 'Differs',
    ONETOUCH: 'Touch',
    NOTOUCH: 'No Touch',
    ACCU: 'Accumulator',
    MULTUP: 'Multiplier Up',
    MULTDOWN: 'Multiplier Down',
};

const WITH_DIGIT = new Set(['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF']);

/** "1HZ100V" → "Volatility 100 (1s) Index", "R_50" → "Volatility 50 Index", others as they are. */
export const marketLabel = (symbol: string) => {
    const one_second = /^1HZ(\d+)V$/i.exec(symbol);
    if (one_second) return `Volatility ${one_second[1]} (1s) Index`;
    const volatility = /^R_(\d+)$/i.exec(symbol);
    if (volatility) return `Volatility ${volatility[1]} Index`;
    const jump = /^JD(\d+)$/i.exec(symbol);
    if (jump) return `Jump ${jump[1]} Index`;
    const boom_crash = /^(BOOM|CRASH)(\d+)N?$/i.exec(symbol);
    if (boom_crash) return `${boom_crash[1][0]}${boom_crash[1].slice(1).toLowerCase()} ${boom_crash[2]} Index`;
    if (/^stpRNG/i.test(symbol)) return 'Step Index';
    return symbol;
};

/** File name without extension, readable: "over_2-recovery.xml" → "Over 2 recovery". */
const nameFromFile = (file_name: string) => {
    const base = file_name
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, 60) || 'Uploaded bot';
};

const fieldValue = (doc: Document, name: string) => {
    const field = Array.from(doc.getElementsByTagName('field')).find(f => f.getAttribute('name') === name);
    return field?.textContent?.trim() ?? '';
};

/** Number inside <value name="…"> (e.g. PREDICTION, DURATION), or ''. */
const valueNumber = (doc: Document, name: string) => {
    const value = Array.from(doc.getElementsByTagName('value')).find(v => v.getAttribute('name') === name);
    const num = value && Array.from(value.getElementsByTagName('field')).find(f => f.getAttribute('name') === 'NUM');
    return num?.textContent?.trim() ?? '';
};

export const readBotFile = (file_name: string, text: string): TBotFile => {
    const result: TBotFile = {
        file_name,
        xml: '',
        name: nameFromFile(file_name),
        market_label: '',
        contract_label: '',
        problems: [],
        warnings: [],
    };
    try {
        result.xml = checkBotFileXml(text);
    } catch (e) {
        result.problems.push((e as Error).message);
        return result;
    }

    const doc = new DOMParser().parseFromString(result.xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length || doc.documentElement.nodeName !== 'xml') {
        result.problems.push('This file is damaged or is not a Deriv Bot file.');
        return result;
    }
    const block_types = new Set(
        Array.from(doc.getElementsByTagName('block')).map(block => block.getAttribute('type') ?? '')
    );
    if (!block_types.has('trade_definition')) {
        result.warnings.push('No "Trade parameters" block found. Open it in the Bot Builder to check it runs.');
    }
    if (!block_types.has('purchase') && !block_types.has('purchase_conditions')) {
        result.warnings.push('No "Purchase" block found, so this bot may never buy a contract.');
    }

    const symbol = fieldValue(doc, 'SYMBOL_LIST');
    result.market_label = symbol ? marketLabel(symbol) : '';

    const purchase = fieldValue(doc, 'PURCHASE_LIST');
    const trade_type = fieldValue(doc, 'TRADETYPE_LIST');
    const prediction = valueNumber(doc, 'PREDICTION');
    const duration = valueNumber(doc, 'DURATION');
    const unit = fieldValue(doc, 'DURATIONTYPE_LIST');
    let contract = PURCHASES[purchase] ?? TRADE_TYPES[trade_type] ?? '';
    if (contract && WITH_DIGIT.has(purchase) && prediction) contract += ` ${prediction}`;
    if (contract && duration && unit === 't') contract += ` · ${duration} tick${duration === '1' ? '' : 's'}`;
    result.contract_label = contract.slice(0, 60);
    return result;
};

/** Reads the files the owner picked (FileList from an <input type="file">). */
export const readBotFiles = async (files: FileList | File[]) =>
    Promise.all(Array.from(files).map(async file => readBotFile(file.name, await file.text())));
