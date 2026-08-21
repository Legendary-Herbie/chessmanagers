import { API_BASE, api, endpoints } from '../../../config/api.js';

export const authApi = {
    me: (options = {}) => api.get(endpoints.auth.me(), options),
    login: credentials => api.post(endpoints.auth.login(), credentials),
    register: account => api.post(endpoints.auth.register(), account),
    logout: () => api.post(endpoints.auth.logout(), {}),
    logoutAll: () => api.post(endpoints.auth.logoutAll(), {}),
    verifyEmail: (token, options = {}) => api.post(endpoints.auth.verify(), { token }, options),
    resendVerification: payload => api.post(endpoints.auth.resend(), payload),
    forgotPassword: payload => api.post(endpoints.auth.forgotPassword(), payload),
    resetPassword: payload => api.post(endpoints.auth.resetPassword(), payload),
    changePassword: passwords => api.patch(endpoints.auth.password(), passwords),
    deleteAccount: payload => api.delete(endpoints.auth.account(), payload),
    googleStartUrl: continuation => `${API_BASE}${endpoints.auth.googleStart(continuation)}`,
};
