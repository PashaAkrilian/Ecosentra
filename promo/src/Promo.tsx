import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, spring, staticFile,
  useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";

const c = theme.colors;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const useSpringAt = (delaySec: number, config: object = theme.spring.smooth) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - Math.round(delaySec * fps), fps, config });
};

const Enter: React.FC<{ at?: number; y?: number; style?: React.CSSProperties; children: React.ReactNode }> =
  ({ at = 0, y = 44, style, children }) => {
    const p = useSpringAt(at);
    return (
      <div style={{ ...style, opacity: p, transform: `translateY(${(1 - p) * y}px) scale(${0.95 + p * 0.05})` }}>
        {children}
      </div>
    );
  };

const Words: React.FC<{ text: string; at?: number; size: number; color?: string; center?: boolean }> =
  ({ text, at = 0, size, color = c.ink, center }) => (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: size * 0.24,
      justifyContent: center ? "center" : "flex-start", fontFamily: theme.fonts.display, fontWeight: 700,
      fontSize: size, lineHeight: 1.06, letterSpacing: "-0.03em", color }}>
      {text.split(" ").map((w, i) => (
        <Enter key={i} at={at + i * 0.1} y={36}>{w}</Enter>
      ))}
    </div>
  );

const body = (size: number, color: string = c.muted): React.CSSProperties =>
  ({ fontFamily: theme.fonts.body, fontSize: size, lineHeight: 1.45, color });

// Fades and lifts the whole scene out, faster than it came in.
const Scene: React.FC<{ children: React.ReactNode; last?: boolean }> = ({ children, last }) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const out = last ? 0 : interpolate(frame, [durationInFrames - fps * 0.33, durationInFrames - 1], [0, 1],
    { easing: theme.ease.in, ...clamp });
  return (
    <AbsoluteFill style={{ opacity: 1 - out, transform: `translateY(${-40 * out + Math.sin(frame / 30) * 2}px)` }}>
      {children}
    </AbsoluteFill>
  );
};

// Window card holding a screenshot (never upscaled) with a slow Ken Burns move.
const Shot: React.FC<{ src: string; w: number; h: number; at?: number; zoom?: [number, number];
  origin?: string; style?: React.CSSProperties }> =
  ({ src, w, h, at = 0.1, zoom = [1, 1.05], origin = "50% 30%", style }) => {
    const frame = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();
    const scale = interpolate(frame, [0, durationInFrames], zoom, { easing: theme.ease.inOut, ...clamp });
    return (
      <Enter at={at} y={90} style={{ position: "absolute", ...style }}>
        <div style={{ width: w, height: h, borderRadius: 20, overflow: "hidden", background: c.card,
          border: `1px solid ${c.rule}`, boxShadow: "0 40px 80px -28px rgba(30,38,32,0.38)" }}>
          <Img src={staticFile(src)} style={{ width: w, height: h, objectFit: "cover",
            transform: `scale(${scale})`, transformOrigin: origin }} />
        </div>
      </Enter>
    );
  };

const Feature: React.FC<{ title: string; text: string; source: string; img: string; zoom?: [number, number]; origin?: string }> =
  ({ title, text, source, img, zoom, origin }) => (
    <Scene>
      <div style={{ position: "absolute", left: 100, top: 300, width: 440 }}>
        <Words text={title} size={80} />
        <Enter at={0.45} style={{ ...body(31), marginTop: 30 }}>{text}</Enter>
        <Enter at={0.7} style={{ ...body(23, c.primary), marginTop: 34, fontWeight: 600 }}>{source}</Enter>
      </div>
      <Shot src={img} w={1230} h={769} zoom={zoom} origin={origin} style={{ left: 600, top: 155 }} />
    </Scene>
  );

// Fire map cropped from the live landing page screenshot (1440x900 source).
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const count = Math.round(1918 * spring({ frame: frame - fps * 0.7, fps, config: { damping: 30, stiffness: 60 } }));
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.06], { easing: theme.ease.inOut, ...clamp });
  const S = 1.45;
  return (
    <Scene>
      <AbsoluteFill style={{ background: c.bg }} />
      <div style={{ position: "absolute", left: 110, top: 80 }}>
        <Words text="Kondisi lahan Indonesia hari ini" size={96} />
      </div>
      <Enter at={0.25} y={60} style={{ position: "absolute", left: 175, top: 240 }}>
        <div style={{ width: 1110 * S, height: 405 * S, overflow: "hidden", position: "relative",
          transform: `scale(${zoom})` }}>
          <Img src={staticFile("img/landing.png")} style={{ position: "absolute", width: 1440 * S,
            left: -165 * S, top: -378 * S }} />
          {/* hides the page's own counter, which is re-animated below */}
          <div style={{ position: "absolute", left: 0, top: 272 * S, width: 218 * S, height: 133 * S, background: c.bg }} />
        </div>
      </Enter>
      <Enter at={0.7} style={{ position: "absolute", left: 110, top: 800 }}>
        <div style={{ fontFamily: theme.fonts.display, fontWeight: 700, fontSize: 130, lineHeight: 1,
          color: c.accent, fontVariantNumeric: "tabular-nums" }}>{count.toLocaleString("id-ID")}</div>
        <div style={{ ...body(32, c.ink), marginTop: 8 }}>titik api terdeteksi satelit dalam 24 jam</div>
      </Enter>
      <Enter at={1.4} style={{ position: "absolute", right: 110, bottom: 60, ...body(22) }}>
        NASA FIRMS · data 28 November 2026 · bukan kebakaran terverifikasi
      </Enter>
    </Scene>
  );
};

const Logo: React.FC<{ size: number; at?: number }> = ({ size, at = 0 }) => {
  const p = useSpringAt(at, theme.spring.bouncy);
  return <Img src={staticFile("img/icon.svg")} style={{ width: size, height: size, opacity: Math.min(1, p),
    transform: `scale(${0.4 + p * 0.6}) rotate(${(1 - p) * -25}deg)` }} />;
};

const centered: React.CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center",
  justifyContent: "center", textAlign: "center" };

const Brand: React.FC = () => (
  <Scene>
    <AbsoluteFill style={centered}>
      <Logo size={190} />
      <div style={{ marginTop: 36 }}><Words text="EcoSentra" at={0.25} size={150} center /></div>
      <Enter at={0.6} style={{ ...body(40), marginTop: 22 }}>
        Titik api, gempa, vegetasi, dan tutupan lahan dalam satu aplikasi web
      </Enter>
    </AbsoluteFill>
  </Scene>
);

const Assistant: React.FC = () => (
  <Scene>
    <div style={{ position: "absolute", left: 100, top: 290, width: 600 }}>
      <Words text="Tanya LandAI, buka di ponsel" size={80} />
      <Enter at={0.7} style={{ ...body(31), marginTop: 30 }}>
        Jawaban diambil dari sumber data yang sama dengan dashboard.
      </Enter>
    </div>
    {/* chat panel cropped 1:1 from landai.png */}
    <Enter at={0.2} y={90} style={{ position: "absolute", left: 790, top: 225 }}>
      <div style={{ width: 484, height: 728, overflow: "hidden", position: "relative", borderRadius: 18,
        boxShadow: "0 40px 80px -28px rgba(30,38,32,0.4)" }}>
        <Img src={staticFile("img/landai.png")} style={{ position: "absolute", width: 1440 * 1.266,
          left: -1033 * 1.266, top: -301 * 1.266 }} />
      </div>
    </Enter>
    <Shot src="img/mobile-dashboard.png" w={390} h={844} at={0.45} zoom={[1, 1.03]}
      style={{ left: 1410, top: 118 }} />
  </Scene>
);

const SOURCES = ["NASA FIRMS", "BMKG", "Esri / Impact Observatory", "NASA MODIS", "Open-Meteo"];

const Sources: React.FC = () => (
  <Scene>
    <AbsoluteFill style={centered}>
      <Words text="Data terbuka, sumbernya tercantum" size={84} center />
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 28, marginTop: 70, width: 1400 }}>
        {SOURCES.map((s, i) => (
          <Enter key={s} at={0.6 + i * 0.16}>
            <div style={{ ...body(38, c.ink), fontWeight: 600, background: c.card, border: `1px solid ${c.rule}`,
              borderRadius: 14, padding: "26px 40px" }}>{s}</div>
          </Enter>
        ))}
      </div>
    </AbsoluteFill>
  </Scene>
);

const Cta: React.FC = () => {
  const p = useSpringAt(0.7, theme.spring.bouncy);
  return (
    <Scene last>
      <AbsoluteFill style={centered}>
        <Logo size={130} />
        <div style={{ marginTop: 40 }}><Words text="Pantau lahanmu hari ini" at={0.2} size={104} center /></div>
        <div style={{ marginTop: 60, opacity: Math.min(1, p), transform: `translateY(${(1 - p) * 40}px) scale(${0.8 + p * 0.2})`,
          background: c.primary, color: "white", borderRadius: 18, padding: "28px 68px",
          fontFamily: theme.fonts.display, fontWeight: 700, fontSize: 66,
          boxShadow: `0 0 70px ${c.primary}66` }}>ecosentra.site</div>
        <Enter at={1.3} style={{ ...body(27), marginTop: 44 }}>
          Open source (MIT) · github.com/PashaAkrilian/Ecosentra
        </Enter>
      </AbsoluteFill>
    </Scene>
  );
};

// [seconds, scene]
const SCENES: [number, React.ReactNode][] = [
  [4.5, <Hook />],
  [2.5, <Brand />],
  [3.5, <Feature title="Dashboard 24 jam" img="img/dashboard.png"
    text="Titik api per provinsi, gempa terbaru, dan tren 7 hari." source="NASA FIRMS · BMKG" />],
  [3.5, <Feature title="Peta & analisis" img="img/peta.png" zoom={[1.02, 1.12]} origin="40% 50%"
    text="Klik titik mana pun, lalu ekspor ke GeoJSON, CSV, atau KML." source="NDVI · tutupan lahan 10 m" />],
  [3, <Feature title="Peringatan bencana" img="img/peringatan.png" origin="50% 20%"
    text="Disusun otomatis dari gempa BMKG dan klaster titik api." source="Bukan pengganti peringatan resmi" />],
  [3, <Assistant />],
  [2.5, <Sources />],
  [4, <Cta />],
];

export const TOTAL_SECONDS = SCENES.reduce((a, [s]) => a + s, 0); // 26.5 s; the pad loops to cover it

const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const blob = (color: string, size: number, pos: React.CSSProperties) => (
    <div style={{ position: "absolute", width: size, height: size, borderRadius: "50%",
      background: `radial-gradient(circle, ${color}, transparent 65%)`, ...pos }} />
  );
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      {blob(`${c.primary}1F`, 1300, { top: -650, left: -350 + Math.sin(frame / 55) * 60 })}
      {blob(`${c.primary}18`, 1100, { bottom: -600, right: -300 + Math.cos(frame / 70) * 50 })}
    </AbsoluteFill>
  );
};

const NOISE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

const Finish: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <AbsoluteFill style={{ background: c.primary, mixBlendMode: "soft-light", opacity: 0.1 }} />
      <AbsoluteFill style={{ backgroundImage: NOISE, backgroundSize: 220, opacity: 0.045, mixBlendMode: "multiply",
        backgroundPosition: `${(frame * 7) % 220}px ${(frame * 13) % 220}px` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 62%, rgba(30,38,32,0.14) 100%)" }} />
    </>
  );
};

export const Promo: React.FC = () => {
  const { fps } = useVideoConfig();
  let t = 0;
  const timed = SCENES.map(([sec, node]) => {
    const from = Math.round(t * fps);
    t += sec;
    return { from, dur: Math.round(sec * fps), node };
  });
  return (
    <AbsoluteFill>
      <Background />
      {timed.map(({ from, dur, node }) => (
        <Sequence key={from} from={from} durationInFrames={dur}>{node}</Sequence>
      ))}
      <Finish />
      <Audio src={staticFile("sfx/pad.wav")} loop volume={0.7} />
      {timed.map(({ from }, i) => (
        <Sequence key={`sfx${i}`} from={Math.max(0, from - 3)}>
          <Audio src={staticFile(i === 1 || i === timed.length - 1 ? "sfx/bass.wav" : "sfx/whoosh.wav")} volume={0.9} />
        </Sequence>
      ))}
      <Sequence from={timed[timed.length - 1].from + Math.round(fps * 0.7) - 3}>
        <Audio src={staticFile("sfx/pop.wav")} volume={1} />
      </Sequence>
    </AbsoluteFill>
  );
};
