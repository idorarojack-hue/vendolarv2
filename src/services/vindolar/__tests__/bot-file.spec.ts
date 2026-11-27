import { marketLabel, readBotFile } from '../bot-file';

// Trimmed from a real Deriv Bot file: market, trade type, options with prediction and duration, purchase.
const BOT_XML = `<xml xmlns="https://developers.google.com/blockly/xml" is_dbot="true" collection="false">
  <block type="trade_definition" id="a" deletable="false" x="0" y="0">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" id="b">
        <field name="MARKET_LIST">synthetic_index</field>
        <field name="SUBMARKET_LIST">random_index</field>
        <field name="SYMBOL_LIST">1HZ100V</field>
        <next>
          <block type="trade_definition_tradetype" id="c">
            <field name="TRADETYPECAT_LIST">digits</field>
            <field name="TRADETYPE_LIST">overunder</field>
          </block>
        </next>
      </block>
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions" id="d">
        <field name="DURATIONTYPE_LIST">t</field>
        <value name="DURATION"><shadow type="math_number_positive" id="e"><field name="NUM">1</field></shadow></value>
        <value name="AMOUNT"><shadow type="math_number_positive" id="f"><field name="NUM">1</field></shadow></value>
        <value name="PREDICTION"><shadow type="math_number_positive" id="g"><field name="NUM">2</field></shadow></value>
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="h" deletable="false" x="0" y="600">
    <statement name="BEFOREPURCHASE_STACK">
      <block type="purchase" id="i"><field name="PURCHASE_LIST">DIGITOVER</field></block>
    </statement>
  </block>
</xml>`;

describe('readBotFile', () => {
    it('reads the market and contract from a Deriv Bot file', () => {
        const file = readBotFile('over_2-recovery.xml', `﻿${BOT_XML}`);
        expect(file.problems).toEqual([]);
        expect(file.warnings).toEqual([]);
        expect(file).toMatchObject({
            name: 'Over 2 recovery',
            market_label: 'Volatility 100 (1s) Index',
            contract_label: 'Over 2 · 1 tick',
        });
        expect(file.xml.startsWith('<xml')).toBe(true);
    });

    it('refuses files that are not bots', () => {
        expect(readBotFile('notes.txt', 'hello').problems[0]).toMatch('not a Deriv Bot file');
        expect(readBotFile('broken.xml', '<xml><block type="x"></xml>').problems[0]).toMatch('damaged');
    });

    it('warns about bots without trade parameters or a purchase block', () => {
        const file = readBotFile(
            'odd.xml',
            '<xml xmlns="https://developers.google.com/blockly/xml"><block type="text"></block></xml>'
        );
        expect(file.problems).toEqual([]);
        expect(file.warnings).toHaveLength(2);
    });

    it('names markets', () => {
        expect(marketLabel('R_50')).toBe('Volatility 50 Index');
        expect(marketLabel('1HZ10V')).toBe('Volatility 10 (1s) Index');
        expect(marketLabel('BOOM1000')).toBe('Boom 1000 Index');
        expect(marketLabel('XYZ')).toBe('XYZ');
    });
});
