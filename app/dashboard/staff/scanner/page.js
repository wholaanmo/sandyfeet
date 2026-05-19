// app/dashboard/staff/scanner/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Html5Qrcode } from 'html5-qrcode';
import {
  extractCheckinTokenFromScan,
  getReservationsPathForCheckin,
  PENDING_CHECKIN_TOKEN_KEY,
} from '@/lib/checkinNavigation';

export default function StaffScannerPage() {
  const router = useRouter();
  const [scanResult, setScanResult] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [currentCameraId, setCurrentCameraId] = useState(null);
  const scannerRef = useRef(null);
  const containerIdRef = useRef('qr-reader');
  const containerRef = useRef(null);
  const stopInProgressRef = useRef(false);
  const scanHandledRef = useRef(false);

  const stopScanner = async () => {
    if (!scannerRef.current || stopInProgressRef.current) return;
    try {
      stopInProgressRef.current = true;
      await scannerRef.current.stop();
      scannerRef.current.clear();
    } catch (e) {
      // Non-critical: stop/clear can throw on some mobile browsers during rapid switches.
    } finally {
      scannerRef.current = null;
      stopInProgressRef.current = false;
      setIsScanning(false);
      if (containerRef.current) containerRef.current.innerHTML = '';
    }
  };

  // Fetch available cameras on mount
  useEffect(() => {
    const fetchCameras = async () => {
      try {
        const cameraList = await Html5Qrcode.getCameras();
        setCameras(cameraList);
        // Prefer back camera
        const backCamera = cameraList.find(cam => cam.label.toLowerCase().includes('back'));
        setCurrentCameraId(backCamera ? backCamera.id : (cameraList[0]?.id || null));
      } catch (err) {
        console.error('Failed to get cameras:', err);
        setCameraError('Could not detect any camera. Please check permissions.');
      }
    };
    fetchCameras();
  }, []);

  const handleScanSuccess = useCallback(async (decodedText) => {
    if (scanHandledRef.current) return;
    scanHandledRef.current = true;

    await stopScanner();

    const token = extractCheckinTokenFromScan(decodedText);
    if (!token) {
      scanHandledRef.current = false;
      setScanResult({ success: false, error: 'Invalid QR code format' });
      return;
    }

    setScanResult({ success: true, token });

    if (typeof window !== 'undefined') {
      sessionStorage.setItem(PENDING_CHECKIN_TOKEN_KEY, token);
    }

    const reservationsPath = getReservationsPathForCheckin();
    const targetUrl = `${reservationsPath}?checkinToken=${encodeURIComponent(token)}`;

    setTimeout(() => {
      router.replace(targetUrl);
    }, 800);
  }, [router]);

  // Start scanner when camera ID is available and no scan result
  useEffect(() => {
    let isMounted = true;
    if (!currentCameraId || scanResult) return;
    if (!containerRef.current) return;

    const startScanner = async () => {
      // Prevent multiple simultaneous starts
      if (stopInProgressRef.current) return;
      
      // Extensive cleanup of any existing instance
      await stopScanner();

      // Final DOM safety check
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }

      if (!isMounted) return;

      try {
        const scanner = new Html5Qrcode(containerIdRef.current);
        scannerRef.current = scanner;

        // Use more flexible constraints for mobile compatibility
        const config = {
          fps: 15, // Slightly lower FPS for better stability on older mobiles
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.7);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
          // Removed explicit videoConstraints facingMode as we are passing a specific ID
        };

        await scanner.start(
          currentCameraId,
          config,
          (decodedText) => handleScanSuccess(decodedText),
          (errorMsg) => {
            // Ignore normal scanning errors
            if (errorMsg && !errorMsg.includes('NotFoundException')) {
              console.debug(errorMsg);
            }
          }
        );

        if (isMounted) {
          setIsScanning(true);
          setCameraError(null);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Camera start error:', err);
          setCameraError('Could not start camera. Please check permissions.');
          setIsScanning(false);
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [currentCameraId, scanResult, handleScanSuccess]);

  const resetScanner = () => {
    scanHandledRef.current = false;
    setScanResult(null);
    setCameraError(null);
    setIsScanning(false);
  };

  const switchCamera = async () => {
    if (cameras.length < 2) return;
    await stopScanner();
    const currentIndex = cameras.findIndex(cam => cam.id === currentCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setCurrentCameraId(cameras[nextIndex].id);
  };

  const handleManualCheckIn = () => router.push(getReservationsPathForCheckin());

  return (
    <div className="px-4 sm:px-9 py-1 min-h-screen" style={{ backgroundColor: 'var(--color-blue-whites)' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header (without switch button) */}
        <div className="mb-6 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/5 px-4 sm:px-5 py-4 shadow-sm">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1E3A8A] font-playfair tracking-tight">
            QR Code Scanner
          </h1>
          <p className="text-[#4D6FA8] text-xs sm:text-sm leading-relaxed mt-1">
            Scan guest's check-in QR code to quickly access their booking
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Scanner Card */}
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
            <div className="border-b border-ocean-light/10 px-6 py-4 bg-ocean-pale/30 flex justify-between items-center">
              <h2 className="font-semibold text-[#1E3A8A] flex items-center gap-2">
                <i className="fas fa-camera text-[#4D8CF5]"></i>
                Camera Scanner
              </h2>
            </div>
            <div className="p-6">
              {cameraError ? (
                <div className="text-center p-6 bg-red-50 rounded-xl border border-red-100">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-exclamation-triangle text-2xl text-red-500"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-red-700 mb-2">Camera Error</h3>
                  <p className="text-red-600 text-sm mb-4">{cameraError}</p>
                  <button
                    onClick={resetScanner}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-sm"
                  >
                    <i className="fas fa-redo-alt mr-2"></i>Retry
                  </button>
                </div>
              ) : !scanResult ? (
                <>
                  <div className="relative">
                    <div
                      id={containerIdRef.current}
                      ref={containerRef}
                      className="w-full rounded-xl overflow-hidden bg-black"
                      style={{ minHeight: '400px', height: 'auto', aspectRatio: '1 / 1' }}
                    />
                                                      {cameras.length > 1 && (
                      <button
                        onClick={switchCamera}
                        className="group absolute top-3 right-3 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/95 border border-[#4D8CF5]/25 text-[#4D6FA8] hover:bg-white hover:border-[#4D8CF5]/45 hover:text-[#3B78E7] transition-all duration-300 text-xs font-medium shadow-sm active:scale-95 backdrop-blur"
                        type="button"
                      >
                        <i className="fas fa-sync-alt text-[#4D8CF5] group-hover:rotate-180 transition-transform duration-500"></i>
                        Switch Camera
                      </button>
                    )}
                  </div>
                  <style jsx global>{`
                    /* Ensure html5-qrcode injected elements fill the container on mobile */
                    #qr-reader,
                    #qr-reader > div {
                      height: 100%;
                    }

                    #qr-reader video,
                    #qr-reader canvas {
                      width: 100% !important;
                      height: 100% !important;
                      object-fit: cover;
                      display: block;
                    }
                  `}</style>
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-500">
                    <i className="fas fa-qrcode text-blue-400"></i>
                    <span>Position QR code inside the square frame</span>
                  </div>
                </>
              ) : scanResult.success ? (
                <div className="text-center p-8 bg-green-50 rounded-xl border border-green-100">
                  <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-check-circle text-3xl text-green-600"></i>
                  </div>
                  <h3 className="text-xl font-bold text-green-800 mb-2">QR Code Scanned!</h3>
                  <p className="text-green-700 text-sm mb-4">Redirecting to booking details...</p>
                  <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
              ) : (
                <div className="text-center p-8 bg-red-50 rounded-xl border border-red-100">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-exclamation-triangle text-2xl text-red-500"></i>
                  </div>
                  <h3 className="text-lg font-semibold text-red-800 mb-2">Invalid QR Code</h3>
                  <p className="text-red-600 text-sm mb-6">{scanResult.error}</p>
                  <button
                    onClick={resetScanner}
                    className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition shadow-sm"
                  >
                    <i className="fas fa-sync-alt mr-2"></i>Scan Again
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Instructions & Manual Check-in (unchanged) */}
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
              <div className="border-b border-ocean-light/10 px-6 py-4 bg-ocean-pale/30">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <i className="fas fa-info-circle text-blue-500"></i>
                  How to Use
                </h2>
              </div>
              <div className="p-6">
                <ol className="space-y-4">
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    <span className="text-gray-700">Allow camera access when prompted</span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    <span className="text-gray-700">Hold the guest's QR code inside the square frame</span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    <span className="text-gray-700">The code is automatically detected and validated</span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold">4</span>
                    <span className="text-gray-700">You'll be taken to the booking details to confirm check-in</span>
                  </li>
                </ol>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
              <div className="border-b border-ocean-light/10 px-6 py-4 bg-ocean-pale/30">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                  <i className="fas fa-keyboard text-blue-500"></i>
                  Manual Check-in
                </h2>
              </div>
              <div className="p-6">
                <p className="text-gray-600 text-sm mb-5">
                  If the QR code is damaged or cannot be scanned, search for the booking manually.
                </p>
                <button
                  onClick={handleManualCheckIn}
                  className="w-full py-2.5 rounded-xl border border-[#7AAAF8]/20 bg-[#7AAAF8]/10 text-[#1E3A8A] hover:bg-[#4D8CF5]/80 hover:text-white transition-all duration-200 shadow-sm flex items-center justify-center gap-2 font-medium"
                >
                  <i className="fas fa-arrow-right"></i>
                  Go to Reservations
                </button>
              </div>
            </div>

            <div className="bg-blue-50/40 rounded-2xl p-5 border border-blue-100">
              <div className="flex items-start gap-3">
                <i className="fas fa-lightbulb text-amber-500 text-lg mt-0.5"></i>
                <div>
                  <h3 className="font-semibold text-gray-800 text-sm">Tips for best scanning</h3>
                  <ul className="mt-2 space-y-1 text-xs text-gray-600">
                    <li>• Ensure good lighting on the QR code</li>
                    <li>• Hold the device steady at a reasonable distance</li>
                    <li>• Keep the QR code flat and within the frame</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}