import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { TokoScriptProduct } from '@/types/tokoScript';
import { generateProtectedLuaWrapper } from '@/lib/tokoScriptStore';

export const PublicRawScript: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const key = searchParams.get('key') || '';
  const [content, setContent] = useState<string>('-- Loading script...');

  useEffect(() => {
    const fetchScript = async () => {
      if (!id) {
        setContent('warn("[Axstools] Script ID missing")');
        return;
      }

      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'toko_scripts_catalog')
          .maybeSingle();

        if (data?.value) {
          const catalog: TokoScriptProduct[] = JSON.parse(data.value);
          const found = catalog.find(
            (p) => p.id === id || (p.rawId && p.rawId.toLowerCase() === id.toLowerCase())
          );

          if (found && found.luaScript) {
            if (found.isMaintenance) {
              const notice = found.maintenanceNotice || 'Script sedang maintenance.';
              setContent(`warn("[Axstools] SCRIPT MAINTENANCE: ${notice}")\npcall(function() game:GetService("StarterGui"):SetCore("SendNotification", { Title = "Axstools Maintenance", Text = "${notice.replace(/"/g, "'")}", Duration = 10 }) end)`);
              return;
            }

            const apiOrigin = window.location.origin;
            // Generate full protected wrapper with Anti-Dumper, Key & HWID checking
            const wrapper = generateProtectedLuaWrapper(found.luaScript, found.title, id, apiOrigin, key);
            setContent(wrapper);
            return;
          }
        }

        // Fallback to supabase edge function get-script
        const resp = await fetch(`https://caecqqzbikmwroevvyrd.supabase.co/functions/v1/get-script?name=${id}&raw=1&public=1`);
        const text = await resp.text();
        setContent(text);
      } catch (err: any) {
        setContent(`warn("[Axstools] Error: ${err.message}")`);
      }
    };

    fetchScript();
  }, [id, key]);

  return (
    <pre style={{ margin: 0, padding: '16px', fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#000', color: '#fff', minHeight: '100vh' }}>
      {content}
    </pre>
  );
};

export default PublicRawScript;
