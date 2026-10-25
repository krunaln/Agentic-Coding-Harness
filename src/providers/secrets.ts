import keytar from 'keytar';

const service = 'myai';

export async function saveProviderSecret(reference: string, value: string) {
    await keytar.setPassword(service, reference, value);
}

export async function loadProviderSecret(reference: string) {
    return keytar.getPassword(service, reference);
}

export async function deleteProviderSecret(reference: string) {
    await keytar.deletePassword(service, reference);
}
