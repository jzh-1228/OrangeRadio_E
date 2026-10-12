export class OnlineProviderError extends Error {
    constructor(code, message, providerId, cause) {
        super(message);
        this.code = code;
        this.providerId = providerId;
        this.cause = cause;
        this.name = 'OnlineProviderError';
    }
}
export { OnlineProviderError as OmniError };
