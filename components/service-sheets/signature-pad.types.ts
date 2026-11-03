import type { SignatureViewProps } from 'react-native-signature-canvas';

export type SignaturePadProps = SignatureViewProps;
export type SignaturePadHandle = { clearSignature: () => void; readSignature: () => void };
