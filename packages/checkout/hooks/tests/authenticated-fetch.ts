import useAuthenticatedFetch from '../authenticated-fetch';
import { vi, describe, it, expect } from 'vitest';

describe('useAuthenticatedFetch', () => {
    vi.mock('@shopify/ui-extensions-react/checkout', () => ({
        useApi: () => ({
            sessionToken: { get: async () => 'mocked_token' }
        })
    }));

    vi.mock('react', () => ({
        useCallback: (callback) => callback,
    }));

    it('fetches data with authorization header', async () => {
        const responseJson = { message: 'Mocked response' };
        const input = 'https://api.example.com/data';

        vi.stubGlobal('fetch', vi.fn(() =>
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve(responseJson)
            })
        ));

        const fetchWithAuth = useAuthenticatedFetch();
        const result = await fetchWithAuth(input, {
            method: 'GET',
            headers: {
                'Custom-Header': 'custom-value',
            }
        });

        // Check that the fetch function was called with the correct parameters
        expect(fetch).toHaveBeenCalledWith(input, {
            headers: {
                'Authorization': 'Bearer mocked_token',
                'Content-Type': 'application/json',
                'Custom-Header': 'custom-value'
            },
            method: 'GET'
        });

        // Check that the fetched data is returned correctly
        expect(result).toEqual(responseJson);
    });

    it('throws an error for non-ok responses', async () => {
        const input = 'https://api.example.com/data';

        vi.stubGlobal('fetch', vi.fn(() =>
            Promise.resolve({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            })
        ));

        const fetchWithAuth = useAuthenticatedFetch();

        // Ensure that an error is thrown for non-ok responses
        await expect(fetchWithAuth(input, {
            method: 'GET',
            headers: {
                'Custom-Header': 'custom-value',
            }
        })).rejects.toThrow('Network response was not ok');

        expect(fetch).toHaveBeenCalledWith(input, {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer mocked_token',
                'Content-Type': 'application/json',
                'Custom-Header': 'custom-value'
            }
        });
    });
});
