import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { SignaturePadHandle, SignaturePadProps } from './signature-pad.types';
export type { SignaturePadHandle } from './signature-pad.types';

type Point = { x: number; y: number };

export default forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad({ penColor = '#07152D', onBegin, onEnd, onOK, onEmpty, onClear, autoClear = false }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paths = useRef<Point[][]>([]);
  const active = useRef(false);
  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(bounds.width * scale); canvas.height = Math.round(bounds.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.strokeStyle = penColor; context.fillStyle = penColor; context.lineWidth = 2.5; context.lineCap = 'round'; context.lineJoin = 'round';
    for (const points of paths.current) {
      if (!points.length) continue;
      context.beginPath();context.moveTo(points[0].x * bounds.width, points[0].y * bounds.height);
      for (const point of points.slice(1)) context.lineTo(point.x * bounds.width, point.y * bounds.height);
      if (points.length === 1) { context.arc(points[0].x * bounds.width, points[0].y * bounds.height, 1.3, 0, Math.PI * 2); context.fill(); }
      else context.stroke();
    }
  }, [penColor]);
  const clear = useCallback(() => { paths.current = [];active.current = false;paint();onClear?.(); }, [onClear, paint]);
  useImperativeHandle(ref, () => ({ clearSignature: clear, readSignature: () => {
    if (!paths.current.some((points) => points.length)) { onEmpty?.();return; }
    const data = canvasRef.current?.toDataURL('image/png');
    if (data) { onOK?.(data);if (autoClear) clear(); }
  } }), [autoClear, clear, onEmpty, onOK]);
  useEffect(() => {
    const observer = new ResizeObserver(paint);
    if (canvasRef.current) observer.observe(canvasRef.current);
    paint();return () => observer.disconnect();
  }, [paint]);
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) };
  };
  return <canvas ref={canvasRef} aria-label="Desenează semnătura clientului" style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
    onPointerDown={(event) => { event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);active.current = true;paths.current.push([point(event)]);paint();onBegin?.(); }}
    onPointerMove={(event) => { if (!active.current) return;event.preventDefault();paths.current[paths.current.length - 1].push(point(event));paint(); }}
    onPointerUp={(event) => { if (!active.current) return;active.current = false;event.currentTarget.releasePointerCapture(event.pointerId);onEnd?.(); }}
    onPointerCancel={() => { active.current = false;onEnd?.(); }}
  />;
});
