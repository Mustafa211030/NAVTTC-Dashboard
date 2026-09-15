"use client";

/**
 * Official letterhead, transcribed from GOVERNMENT_OF_PAKISTAN_logo.docx.
 *
 * Wording, ordering and the two emblems are reproduced exactly as supplied:
 * the State Emblem of Pakistan on the left, the NAVTTC crest on the right.
 * Do not paraphrase the titles or the address — this is the department's
 * own letterhead and printed reports are treated as official output.
 *
 * `variant="print"` sizes everything in points for paper; `variant="screen"`
 * uses pixels. Both render the same content so a printed page and an on-screen
 * report never disagree.
 */
export function Letterhead({ variant = "print" }: { variant?: "print" | "screen" }) {
  const p = variant === "print";
  const logo = p ? 46 : 54;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: p ? "8pt" : "14px",
        width: "100%",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/emblem-pakistan.png"
        alt="State Emblem of Pakistan"
        width={logo}
        height={logo}
        style={{ height: p ? "34pt" : "46px", width: "auto", flexShrink: 0 }}
      />

      <div style={{ textAlign: "center", flex: 1, lineHeight: 1.25 }}>
        <div style={{ fontSize: p ? "10.5pt" : "15px", fontWeight: 800, letterSpacing: ".05em" }}>
          GOVERNMENT OF PAKISTAN
        </div>
        <div style={{ fontSize: p ? "8.4pt" : "12px", fontWeight: 700, letterSpacing: ".015em" }}>
          NATIONAL VOCATIONAL &amp; TECHNICAL TRAINING COMMISSION
        </div>
        <div style={{ fontSize: p ? "6.2pt" : "10px", marginTop: p ? "0.8pt" : "2px" }}>
          Headquarters, Plot No. 38, Kirthar Road, Sector H-9/4, Islamabad
        </div>
        <div style={{ fontSize: p ? "6.2pt" : "10px", fontWeight: 600 }}>http://navttc.gov.pk</div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/navttc-logo.jpg"
        alt="NAVTTC"
        width={logo}
        height={logo}
        style={{ height: p ? "34pt" : "46px", width: "auto", flexShrink: 0 }}
      />
    </div>
  );
}
