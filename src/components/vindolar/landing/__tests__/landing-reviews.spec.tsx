import { render, screen } from '@testing-library/react';
import Landing from '../landing';
import { REVIEWS } from '../reviews';

jest.mock('@/components/shared', () => ({ generateOAuthURL: jest.fn() }));
jest.mock('@/components/vindolar/market-ticker', () => () => null);
jest.mock('@/pages/main/global-status', () => ({ RiskDialog: () => null }));
jest.mock('../reviews', () => ({ REVIEWS: [] }));

describe('landing slider', () => {
    afterEach(() => {
        REVIEWS.length = 0;
    });

    it('shows the tool cards while there are no customer reviews', () => {
        render(<Landing onExplore={jest.fn()} />);
        expect(screen.getByRole('heading', { name: 'What’s inside Vindolar' })).toBeInTheDocument();
        expect(screen.getAllByText('Vindolar tool').length).toBeGreaterThan(0);
    });

    it('shows customer reviews with stars once reviews.ts has some', () => {
        REVIEWS.push({ name: 'Test Person', country: 'Test Country', rating: 4, text: 'Test review text.' });
        render(<Landing onExplore={jest.fn()} />);
        expect(screen.getByRole('heading', { name: 'What traders say' })).toBeInTheDocument();
        expect(screen.getByText('“Test review text.”')).toBeInTheDocument();
        expect(screen.getByText('Test Country')).toBeInTheDocument();
        // The test translation mock leaves {{rating}} as is; the app fills it in.
        const stars = screen.getByRole('img', { name: /out of 5 stars/ });
        expect(stars.querySelectorAll('i.is-on')).toHaveLength(4);
        expect(screen.getByText('TP')).toBeInTheDocument();
        expect(screen.queryByText('Vindolar tool')).not.toBeInTheDocument();
    });
});
