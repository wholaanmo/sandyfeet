// lib/staffEmailService.js

// Get base URL for API calls
const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '');
  }

  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, '');
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return 'http://localhost:3000';
};

export async function sendStaffVerificationEmail(email, name, verificationLink, role) {
  // Capitalize role for display
  const displayRole = role === 'admin' ? 'Admin' : 'Staff Member';
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Welcome to Sandy Feet Resort!</h1>
        <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
      </div>
      
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${name}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">Your staff account has been created for the Sandy Feet Resort management system.</p>
        
        <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Account Details:</h3>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Role:</strong> ${displayRole}</p>
        </div>
        
        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p style="color: #e65100; margin: 0; font-size: 14px;">
            <strong>Important:</strong> Please verify your email address to activate your account. The verification link will expire in <strong>15 minutes</strong>.
          </p>
        </div>
        
        <p style="margin: 15px 0; text-align: center;">
          <a href="${verificationLink}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Verify Email Address
          </a>
        </p>
        
        <p style="color: #666; font-size: 12px; text-align: center; margin-top: 15px;">
          Or copy and paste this link into your browser:<br>
          <span style="color: #2C7A7A;">${verificationLink}</span>
        </p>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>If you did not request this account, please ignore this email.</p>
        <p>&copy; ${new Date().getFullYear()} Sandy Feet Resort. All rights reserved.</p>
      </div>
    </div>
  `;
  
  return await sendEmail(email, 'Verify Your Account - Sandy Feet Resort', emailContent);
}

export async function sendStaffWelcomeEmail(email, name) {
  const loginUrl = `${getBaseUrl()}/login`;
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f0f9ff; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0B3B4F; font-family: 'Playfair Display', serif;">Email Verified Successfully!</h1>
        <div style="width: 50px; height: 3px; background-color: #2C7A7A; margin: 10px auto;"></div>
      </div>
      
      <div style="background-color: white; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #0B3B4F; font-size: 16px;">Dear <strong>${name}</strong>,</p>
        <p style="color: #0B3B4F; font-size: 16px;">Your email address has been successfully verified! Your account is now <strong style="color: #2C7A7A;">ACTIVE</strong>.</p>
        
        <div style="background-color: #e8f5e9; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <h3 style="color: #0B3B4F; margin-bottom: 10px;">Next Steps:</h3>
          <p>1. Click the button below to log in to your account</p>
          <p>2. Use your email address and the password provided by the administrator</p>
          <p>3. You can change your password after logging in</p>
        </div>
        
        <p style="margin: 15px 0; text-align: center;">
          <a href="${loginUrl}" style="background-color: #2C7A7A; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
            Login to Your Account
          </a>
        </p>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px;">
        <p>Welcome to the team!</p>
        <p>&copy; ${new Date().getFullYear()} Sandy Feet Resort. All rights reserved.</p>
      </div>
    </div>
  `;
  
  return await sendEmail(email, 'Welcome to Sandy Feet Resort - Account Activated', emailContent);
}

async function sendEmail(to, subject, htmlContent) {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        subject,
        html: htmlContent,
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to send email');
    }

    const result = await response.json();
    if (result?.success === false) {
      throw new Error(result.error || 'Failed to send email');
    }

    return result;
  } catch (error) {
    console.error('Error sending staff email:', error);
    return { success: false, error: error.message };
  }
}