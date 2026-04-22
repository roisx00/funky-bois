import { useState } from 'react';
import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, lightTheme } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from './config/wagmi';

// Theme to match THE 1969 editorial cream aesthetic.
// Based on lightTheme() then overridden with design tokens so no default leaks.
const the1969Theme = lightTheme({
  accentColor:           '#0E0E0E',  // ink (wallet selection highlight)
  accentColorForeground: '#F9F6F0',  // paper
  borderRadius:          'small',
  overlayBlur:           'small',
  fontStack:             'system',
});

// Page + panel surfaces
the1969Theme.colors.modalBackground   = '#F9F6F0';   // cream canvas
the1969Theme.colors.modalBackdrop     = 'rgba(14,14,14,0.78)';
the1969Theme.colors.modalBorder       = '#0E0E0E';   // ink border
the1969Theme.colors.generalBorder     = '#DDD7CB';   // hairline
the1969Theme.colors.generalBorderDim  = '#E9E3D6';
the1969Theme.colors.modalText         = '#0E0E0E';
the1969Theme.colors.modalTextSecondary = '#3B3630';
the1969Theme.colors.modalTextDim      = '#6C6457';

// Wallet row backgrounds
the1969Theme.colors.menuItemBackground         = '#FFFFFF';
the1969Theme.colors.actionButtonBorder         = '#DDD7CB';
the1969Theme.colors.actionButtonBorderMobile   = '#DDD7CB';
the1969Theme.colors.actionButtonSecondaryBackground = '#F2EEE6';
the1969Theme.colors.closeButton                = '#6C6457';
the1969Theme.colors.closeButtonBackground      = 'rgba(14,14,14,0.04)';

// Connect / profile buttons
the1969Theme.colors.connectButtonBackground      = '#FFFFFF';
the1969Theme.colors.connectButtonBackgroundError = '#FBE2E2';
the1969Theme.colors.connectButtonInnerBackground = '#F2EEE6';
the1969Theme.colors.connectButtonText            = '#0E0E0E';
the1969Theme.colors.connectButtonTextError       = '#CC3A2A';
the1969Theme.colors.profileAction                = '#FFFFFF';
the1969Theme.colors.profileActionHover           = 'rgba(14,14,14,0.05)';
the1969Theme.colors.profileForeground            = '#FFFFFF';

the1969Theme.fonts.body = "'Space Grotesk', system-ui, sans-serif";

export default function Providers({ children }) {
  const [qc] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider
          theme={the1969Theme}
          modalSize="compact"
          appInfo={{ appName: 'THE 1969' }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
