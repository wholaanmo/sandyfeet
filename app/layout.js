import './globals.css'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/SandyFeet_logo2.png" type="image/png" />
        <link rel="icon" href="/SandyFeet_logo2.png" sizes="32x32" />
        <link rel="icon" href="/SandyFeet_logo2.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/SandyFeet_logo2.png" />
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