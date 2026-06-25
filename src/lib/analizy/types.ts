export const TICKER = "ALL88" as const;
export const ANALIZY_URL = "https://www.analizy.pl/fundusze-ppk/ALL88/allianz-plan-emerytalny-2055" as const;
export const FUND_LABEL = "Allianz Plan Emerytalny 2055" as const;

export type ParseResult = { ok: true; price: number; priceText: string } | { ok: false; error: string };
