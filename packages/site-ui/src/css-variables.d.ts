import "react";

declare module "react" {
  interface CSSProperties {
    /** The mobile menu's cascade stagger index (mobile-menu.css). */
    "--i"?: number;
  }
}
