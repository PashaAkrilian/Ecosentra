import { Composition } from "remotion";
import { Promo, TOTAL_SECONDS } from "./Promo";

export const Root = () => (
  <Composition id="Promo" component={Promo} fps={30} width={1920} height={1080}
    durationInFrames={TOTAL_SECONDS * 30} />
);
