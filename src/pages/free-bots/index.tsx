import BotLibrary from '@/components/vindolar/bot-library/bot-library';
import ToolHero, { PageBackdrop } from '@/components/vindolar/tool-hero';
import { localize } from '@deriv-com/translations';
import '@/components/vindolar/vindolar.scss';
import '../analysis-tools/analysis-tools.scss';

/** Ready-made bots. The site owner can add, edit, hide, reorder and delete them. */
const FreeBots = () => (
    <div className='vd-page vd-page--dark'>
        <PageBackdrop />
        <ToolHero
            eyebrow={localize('Vindolar · Bots')}
            title={localize('Free Bots')}
            subtitle={localize(
                'Ready-made bots. Loading one opens it in the Bot Builder, where you can read every block before pressing Run.'
            )}
        />
        <p className='vd-page__note'>
            {localize(
                'Every bot has a take profit and stop loss already set. Start on your demo account, and remember that stake-sizing systems change how you win or lose, not your odds.'
            )}
        </p>
        <BotLibrary collection='free' card_label='Free bot' empty_text={localize('No bots are published right now.')} />
    </div>
);

export default FreeBots;
