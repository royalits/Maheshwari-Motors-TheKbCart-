import React, { useEffect, useState } from "react";
import { FaQrcode } from "react-icons/fa";
import {
  generateItemQrDataUrl,
  getItemQrLabel,
  getItemQrValue,
} from "../../utils/itemQr";

const ItemQrPreview = ({
  item,
  size = 140,
  showName = true,
  showValue = false,
  className = "",
}) => {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadQr = async () => {
      if (!item) {
        setQrDataUrl("");
        setError("");
        return;
      }

      try {
        setError("");
        const nextDataUrl = await generateItemQrDataUrl(item, size);
        if (!cancelled) {
          setQrDataUrl(nextDataUrl);
        }
      } catch (qrError) {
        if (!cancelled) {
          setQrDataUrl("");
          setError(qrError?.message || "Unable to generate QR");
        }
      }
    };

    loadQr();

    return () => {
      cancelled = true;
    };
  }, [item, size]);

  if (!item) {
    return null;
  }

  const label = getItemQrLabel(item);
  const qrValue = !error ? getItemQrValue(item) : "";

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-slate-50 p-4 ${className}`}
    >
      <div className="flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-3">
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt={`${label} QR`}
            className="rounded"
            style={{ width: size, height: size }}
          />
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 text-slate-500"
            style={{ width: size, height: size }}
          >
            <FaQrcode className="text-3xl" />
            <span className="text-xs text-center">
              {error || "Generating QR..."}
            </span>
          </div>
        )}
      </div>

      {showName && (
        <div className="mt-3 text-center">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          {item?.item_id && (
            <p className="text-xs text-slate-500">Item ID: {item.item_id}</p>
          )}
        </div>
      )}

      {showValue && qrValue && (
        <p className="mt-2 break-all text-center text-[11px] text-slate-500">
          {qrValue}
        </p>
      )}
    </div>
  );
};

export default ItemQrPreview;
