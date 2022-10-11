import { Metric, onCLS, onFCP, onFID, onLCP, onTTFB } from "web-vitals"

declare global {
    interface Navigator {
        connection: { effectiveType: string }
    }
}

const VITALS_URL = "https://vitals.vercel-analytics.com/v1/vitals"
const VERCEL_ANALYTICS_ID = process.env.VERCEL_ANALYTICS_ID

function getConnectionSpeed() {
    return "connection" in navigator &&
    navigator["connection"] &&
    "effectiveType" in navigator["connection"]
        ? navigator["connection"]["effectiveType"]
        : ""
}

function sendToAnalytics(metric: Metric) {
    if (!VERCEL_ANALYTICS_ID) {
        return
    }

    const body = {
        dsn: VERCEL_ANALYTICS_ID,
        id: metric.id,
        page: window.location.pathname,
        href: window.location.href,
        event_name: metric.name,
        value: metric.value.toString(),
        speed: getConnectionSpeed(),
    }

    const blob = new Blob([new URLSearchParams(body).toString()], {
        // This content type is necessary for `sendBeacon`
        type: "application/x-www-form-urlencoded",
    })
    if (navigator.sendBeacon) {
        navigator.sendBeacon(VITALS_URL, blob)
    } else
        fetch(VITALS_URL, {
            body: blob,
            method: "POST",
            credentials: "omit",
            keepalive: true,
        })
}

export default function report() {
    try {
        onFID(metric => sendToAnalytics(metric))
        onTTFB(metric => sendToAnalytics(metric))
        onLCP(metric => sendToAnalytics(metric))
        onCLS(metric => sendToAnalytics(metric))
        onFCP(metric => sendToAnalytics(metric))
    } catch (err) {
        console.error(err)
    }
}
