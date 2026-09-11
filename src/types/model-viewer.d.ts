import type React from "react";

/** Element interface for the parts of <model-viewer> this app uses. */
export interface ModelViewerElement extends HTMLElement {
  activateAR: () => Promise<void>;
  canActivateAR: boolean;
}

interface ModelViewerAttributes extends React.HTMLAttributes<HTMLElement> {
  src?: string;
  alt?: string;
  poster?: string;
  ar?: boolean | "";
  "ar-modes"?: string;
  "ar-scale"?: string;
  "ar-placement"?: string;
  "camera-controls"?: boolean | "";
  "auto-rotate"?: boolean | "";
  "auto-rotate-delay"?: number | string;
  "rotation-per-second"?: string;
  "shadow-intensity"?: number | string;
  "shadow-softness"?: number | string;
  "camera-orbit"?: string;
  "field-of-view"?: string;
  "min-camera-orbit"?: string;
  "max-camera-orbit"?: string;
  "touch-action"?: string;
  "interaction-prompt"?: string;
  exposure?: number | string;
  loading?: "auto" | "lazy" | "eager";
  ref?: React.Ref<ModelViewerElement>;
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": ModelViewerAttributes;
    }
  }
}
