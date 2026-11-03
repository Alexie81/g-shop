import { forwardRef, useImperativeHandle, useRef } from 'react';
import NativeSignatureScreen, { SignatureViewRef } from 'react-native-signature-canvas';
import type { SignaturePadHandle, SignaturePadProps } from './signature-pad.types';
export type { SignaturePadHandle } from './signature-pad.types';

export default forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad(props, ref) {
  const nativeRef = useRef<SignatureViewRef>(null);
  useImperativeHandle(ref, () => ({ clearSignature: () => nativeRef.current?.clearSignature(), readSignature: () => nativeRef.current?.readSignature() }), []);
  return <NativeSignatureScreen {...props} ref={nativeRef} />;
});
