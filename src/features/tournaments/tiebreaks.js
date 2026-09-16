export const TIEBREAKS = {
    buchholz: { label: 'Buchholz', help: "Sum of all opponents’ scores. Rewards playing tougher opponents." },
    sonnebornBerger: { label: 'Sonneborn-Berger (SB)', help: 'Sum of scores of defeated opponents plus half the scores of drawn opponents.' },
    directHeadToHead: { label: 'Head-to-head (H2H)', help: 'Direct results between players still tied after the preceding criteria.' },
};
export const DEFAULT_TIEBREAKS = Object.keys(TIEBREAKS);
