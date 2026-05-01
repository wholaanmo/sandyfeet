import './globals.css'

export const metadata = {
  title: "Sandyfeet Resort",
  description: "Experience luxury and comfort at Sandyfeet Resort. Book your stay online.",
  icons: {
    icon: [
      { url: "/SandyFeet_logo2.png", type: "image/png" },
    ],
    apple: [
      { url: "/SandyFeet_logo2.png" },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Favicon for modern browsers */}
        <link rel="icon" type="image/png" href="/SandyFeet_logo2.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/SandyFeet_logo2.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/SandyFeet_logo2.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/SandyFeet_logo2.png" />
        <link rel="shortcut icon" href="/SandyFeet_logo2.png" />
        
        {/* Font Awesome */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css"
        />
        {/* Material Icons */}
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}