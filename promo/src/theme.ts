import { Easing } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadBody } from "@remotion/google-fonts/PublicSans";

const display = loadDisplay("normal", { weights: ["600", "700"], subsets: ["latin"] });
const body = loadBody("normal", { weights: ["400", "600"], subsets: ["latin"] });

export const theme = {
  colors: {
    bg: "#EDF0EA", card: "#FFFFFF", ink: "#1E2620", muted: "#56615A",
    primary: "#2E6B4E", accent: "#D9481F", land: "#DCE4D9", rule: "#C9D2C8",
  },
  fonts: { display: display.fontFamily, body: body.fontFamily },
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1),
    inOut: Easing.bezier(0.83, 0, 0.17, 1),
    in: Easing.bezier(0.7, 0, 0.84, 0),
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
  },
} as const;
