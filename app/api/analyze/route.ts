import { NextResponse } from 'next/server';
import { storeSignal } from '@/lib/rag';
import { clarifyRequirements } from '@/lib/agents/pm';
import { planTechnicalTasks } from '@/lib/agents/tech-lead';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const { url, urls, description, stage = 'prepare' } = body;

    // Normalize urls to an array if provided, or use url legacy param
    const targetUrls: string[] = urls || (url ? [url] : []);

    if ((targetUrls.length === 0 && !description) || (description && typeof description !== 'string')) {
      return NextResponse.json({ success: false, error: 'URL(s) or Description is required' }, { status: 400 });
    }
    
    // Check if keys were actually present in process.env when supabase was init
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
       console.warn("Supabase keys missing. Returning mock response.");
       return NextResponse.json({
         success: true,
         data: {
           featureName: "Refactored Architecture Demo (Mock Mode)",
           score: 95,
           decision: "GO",
           rationale: "This is a mock response because Supabase credentials are missing. The architecture supports AI-driven analysis.",
           prd: { title: "Mock PRD", summary: "Mock Summary" },
           tasks: [
             { title: "Configure Supabase", description: "Add env vars to .env.local", type: "chore", priority: "high", affected_files: [".env.local"] }
           ]
         }
       });
    }

    // 1. Fetch & Store Signal (Simulating User Input / Webhook)
    const urlText = targetUrls.length > 0 ? targetUrls.map(u => `Reference/Competitor URL: ${u}`).join('\n') : '';
    const mockContent = `New Idea: ${description || 'No description provided.'}\n` + 
      (urlText ? `${urlText}\n` : '') +
      `Context: Please analyze the idea${urlText ? ' and the provided reference URLs' : ''}.`;
    
    // Only store signal if NOT in plan stage (plan stage uses existing signalId)
    let signal = null;
    let signalId = body.signalId;

    if (stage !== 'plan') {
      // Use URL or a placeholder for signal source
      const signalSource = targetUrls.join(',') || 'user-input-idea';
      signal = await storeSignal(signalSource, mockContent);

      if (!signal) throw new Error("Failed to store signal - Database connection failed");
      signalId = signal.id;
      console.log(`[Flow] Signal Received: ${signal.id}`);
    } else {
        // For plan stage, we rely on the passed signalId.
        // We can optionally verify it exists, but for now we assume it's valid if present.
        if (!signalId) {
             // Fallback if frontend didn't send it (legacy support or bug)
             // But we really should have it. 
             console.warn("[Flow] Warning: No signalId provided for plan stage. Creating new signal as fallback.");
             const signalSource = targetUrls.join(',') || 'user-input-idea';
             signal = await storeSignal(signalSource, mockContent);
             if (signal) signalId = signal.id;
        }
    }

    if (stage === 'suggest_url') {
      if (!description) {
         return NextResponse.json({ success: false, error: 'Description is required for URL suggestion' }, { status: 400 });
      }
      console.log(`[Flow] Running Competitor Analysis...`);
      const { suggestCompetitorUrl } = await import('@/lib/agents/prepare');
      const suggestion = await suggestCompetitorUrl(description);
      
      return NextResponse.json({
        success: true,
        stage: 'suggest_url',
        data: suggestion
      });
    }

    if (stage === 'prepare') {
       console.log(`[Flow] Running Prepare Agent (Red/Blue Team)...`);
       const { runPrepareAgent } = await import('@/lib/agents/prepare');
       const { updateSignalStatus } = await import('@/lib/signal-service');

       if (signalId) {
          // Update status to ANALYZED once Prepare starts/finishes
          // We do it after success to be safe, or before if we want to track 'in_progress'
       }
       
       const prepareResult = await runPrepareAgent(mockContent);
       
       if (signalId) {
          await updateSignalStatus(signalId, 'ANALYZED');
       }
       
       return NextResponse.json({
         success: true,
         stage: 'prepare',
         data: {
             ...prepareResult,
             signalId: signalId // Pass signalId back to frontend for next step
         }
       });
    }

    // Handle user approval / override
    if (stage === 'approve') {
        const { confirmed_proposal } = body;
        if (!signalId) {
           return NextResponse.json({ success: false, error: 'Signal ID is required for Approval' }, { status: 400 });
        }
        
        const { updateSignalStatus } = await import('@/lib/signal-service');
        await updateSignalStatus(signalId, 'APPROVED', confirmed_proposal);
        
        return NextResponse.json({ success: true, stage: 'approve' });
    }

    // If stage is 'plan', we expect the user has confirmed.
    if (stage === 'plan') {
       const { confirmed_proposal } = body;
       
       if (!signalId) {
           return NextResponse.json({ success: false, error: 'Signal ID is required for Plan stage' }, { status: 400 });
       }
       
       // State Guard: Check if status is APPROVED
       const { getSignalStatus } = await import('@/lib/signal-service');
       const signalState = await getSignalStatus(signalId);
       
       if (!signalState || signalState.status !== 'APPROVED') {
           // Allow auto-approval if confirmed_proposal is provided (Legacy/One-step mode)
           // But ideally we should reject. For now, let's strict check.
           // If user sends confirmed_proposal here, we can auto-approve.
           if (confirmed_proposal) {
               const { updateSignalStatus } = await import('@/lib/signal-service');
               await updateSignalStatus(signalId, 'APPROVED', confirmed_proposal);
           } else {
               return NextResponse.json({ success: false, error: 'Signal must be APPROVED by user before Planning. Call stage="approve" first.' }, { status: 403 });
           }
       }
       
       // Use the refined content from DB if available, else confirmed_proposal, else mockContent
       const requirementContent = (signalState?.refined_content) || confirmed_proposal || mockContent;
       
       // 2. Step 1: PM Agent (Clarify Requirements)
       console.log(`[Flow] Invoking PM Agent for Signal: ${signalId}`);
       const prd = await clarifyRequirements(signalId, requirementContent);
       console.log(`[Flow] PRD Generated:`, prd.title);

       // 3. Step 2: Tech Lead Agent (Plan Tasks based on PRD)
       // We convert the PRD object back to string to pass as context.
       const prdContent = JSON.stringify(prd, null, 2);
       
       console.log(`[Flow] Invoking Tech Lead Agent...`);
       const techLeadResult = await planTechnicalTasks(signalId, prdContent);

       if (!techLeadResult || !techLeadResult.tasks) {
           throw new Error("Tech Lead failed to generate tasks");
       }

       // 4. Return structured response
       return NextResponse.json({
         success: true,
         stage: 'plan',
         data: {
           featureName: prd.title || ("Analysis from " + (targetUrls[0] || "User Idea")),
           score: prd.score || 0,
           decision: prd.decision || "NO_GO",
           rationale: prd.rationale || "No rationale provided.",
           prd: prd,
           tasks: techLeadResult.tasks // Extract the tasks array correctly
         }
       });
    }

    return NextResponse.json({ success: false, error: 'Invalid stage' }, { status: 400 });

  } catch (error) {
    console.error("Analysis Error:", error);
    return NextResponse.json({ success: false, error: 'Analysis failed' }, { status: 500 });
  }
}
