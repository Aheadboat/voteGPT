export type AddressSuggestion = { id: string; address: string };

export type AddressSuggestionResponse =
  | { status: "ok"; suggestions: AddressSuggestion[] }
  | {
      status: "unavailable" | "invalid_request" | "forbidden" | "unauthenticated" | "rate_limited";
      message: string;
    };

export const ADDRESS_SUGGESTION_MIN_LENGTH = 4;
