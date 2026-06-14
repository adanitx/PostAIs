/// <reference types="vite/client" />

import type { PostRequestPayload, PostResponsePayload, SecretDescriptor, SecretMutationResult, SecretScope } from './types';

declare global {
  interface Window {
    postais?: {
      sendRequest: (payload: PostRequestPayload) => Promise<PostResponsePayload>;
      setSecret: (payload: { key: string; value: string; scope: SecretScope }) => Promise<SecretMutationResult>;
      deleteSecret: (payload: { key: string }) => Promise<SecretMutationResult>;
      listSecrets: () => Promise<SecretDescriptor[]>;
      saveTextFile: (payload: { suggestedName: string; title: string; content: string }) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string; error?: string }>;
    };
  }
}

export {};