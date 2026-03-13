/**
 * AutomationService — pipeline automation with cron and webhook triggers.
 *
 * Architecture:
 *   automation tool -> AutomationService -> Supabase DB + node-cron scheduler
 *
 * Supports creating, managing, and executing automated pipelines.
 */

import * as cron from 'node-cron';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineConfig {
  name: string;
  agentId: string;
  triggerType: 'cron' | 'webhook';
  triggerConfig: Record<string, any>;
  taskDesign: string;
  variablesSchema?: Record<string, any>;
  variables?: Record<string, any>;
  executionConfig?: {
    maxIterations?: number;
    timeoutMinutes?: number;
  };
}

export interface Pipeline {
  id: string;
  name: string;
  agentId: string;
  triggerType: string;
  triggerConfig: Record<string, any>;
  taskDesign: string;
  variablesSchema: Record<string, any>;
  variables: Record<string, any>;
  executionConfig: Record<string, any>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  triggerType: string;
  triggerPayload: Record<string, any>;
  status: string;
  result: Record<string, any>;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: AutomationService | null = null;

export function getAutomationService(): AutomationService {
  if (!_instance) {
    _instance = new AutomationService();
  }
  return _instance;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AutomationService {
  private cronJobs = new Map<string, cron.ScheduledTask>();
  private supabase: any = null;

  private async getSupabase() {
    if (!this.supabase) {
      const { supabase } = await import('../db/client');
      this.supabase = supabase;
    }
    return this.supabase;
  }

  // -------------------------------------------------------------------------
  // Pipeline CRUD
  // -------------------------------------------------------------------------

  async createPipeline(config: PipelineConfig): Promise<Pipeline> {
    const db = await this.getSupabase();

    const { data, error } = await db
      .from('automation_pipelines')
      .insert({
        name: config.name,
        agent_id: config.agentId,
        trigger_type: config.triggerType,
        trigger_config: config.triggerConfig,
        task_design: config.taskDesign,
        variables_schema: config.variablesSchema || {},
        variables: config.variables || {},
        execution_config: config.executionConfig || { max_iterations: 30, timeout_minutes: 60 },
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create pipeline: ${error.message}`);
    }

    const pipeline = this.mapPipeline(data);

    // Register cron job if applicable
    if (config.triggerType === 'cron' && config.triggerConfig.expression) {
      this.registerCronJob(pipeline);
    }

    return pipeline;
  }

  async listPipelines(agentId?: string): Promise<Pipeline[]> {
    const db = await this.getSupabase();

    let query = db
      .from('automation_pipelines')
      .select('*')
      .neq('status', 'deleted')
      .order('created_at', { ascending: false });

    if (agentId) {
      query = query.eq('agent_id', agentId);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to list pipelines: ${error.message}`);
    }

    return (data || []).map(this.mapPipeline);
  }

  async updatePipeline(id: string, config: Partial<PipelineConfig>): Promise<Pipeline> {
    const db = await this.getSupabase();

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (config.name) updates.name = config.name;
    if (config.triggerConfig) updates.trigger_config = config.triggerConfig;
    if (config.taskDesign) updates.task_design = config.taskDesign;
    if (config.variables) updates.variables = config.variables;
    if (config.executionConfig) updates.execution_config = config.executionConfig;

    const { data, error } = await db
      .from('automation_pipelines')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update pipeline: ${error.message}`);
    }

    const pipeline = this.mapPipeline(data);

    // Re-register cron job if needed
    if (config.triggerConfig && pipeline.triggerType === 'cron') {
      this.unregisterCronJob(id);
      if (pipeline.status === 'active') {
        this.registerCronJob(pipeline);
      }
    }

    return pipeline;
  }

  async pausePipeline(id: string): Promise<void> {
    const db = await this.getSupabase();

    const { error } = await db
      .from('automation_pipelines')
      .update({ status: 'paused', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to pause pipeline: ${error.message}`);
    }

    this.unregisterCronJob(id);
  }

  async resumePipeline(id: string): Promise<void> {
    const db = await this.getSupabase();

    const { data, error } = await db
      .from('automation_pipelines')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to resume pipeline: ${error.message}`);
    }

    const pipeline = this.mapPipeline(data);
    if (pipeline.triggerType === 'cron') {
      this.registerCronJob(pipeline);
    }
  }

  async deletePipeline(id: string): Promise<void> {
    const db = await this.getSupabase();

    const { error } = await db
      .from('automation_pipelines')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete pipeline: ${error.message}`);
    }

    this.unregisterCronJob(id);
  }

  // -------------------------------------------------------------------------
  // Pipeline runs
  // -------------------------------------------------------------------------

  async getHistory(pipelineId: string, limit = 20): Promise<PipelineRun[]> {
    const db = await this.getSupabase();

    const { data, error } = await db
      .from('automation_runs')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get pipeline history: ${error.message}`);
    }

    return (data || []).map(this.mapRun);
  }

  async triggerRun(pipelineId: string, payload?: any): Promise<PipelineRun> {
    const db = await this.getSupabase();

    const { data, error } = await db
      .from('automation_runs')
      .insert({
        pipeline_id: pipelineId,
        trigger_type: 'manual',
        trigger_payload: payload || {},
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to trigger pipeline run: ${error.message}`);
    }

    // NOTE: Actual execution would be handled by a background worker
    // that picks up 'pending' runs. This is a simplified version.

    return this.mapRun(data);
  }

  // -------------------------------------------------------------------------
  // Cron management
  // -------------------------------------------------------------------------

  private registerCronJob(pipeline: Pipeline): void {
    const expression = pipeline.triggerConfig?.expression;
    if (!expression || !cron.validate(expression)) {
      console.warn(`[Automation] Invalid cron expression for pipeline ${pipeline.id}: ${expression}`);
      return;
    }

    const task = cron.schedule(expression, async () => {
      try {
        await this.triggerRun(pipeline.id, { trigger: 'cron', scheduled: true });
      } catch (err: any) {
        console.error(`[Automation] Cron trigger failed for pipeline ${pipeline.id}:`, err.message);
      }
    });

    this.cronJobs.set(pipeline.id, task);
  }

  private unregisterCronJob(pipelineId: string): void {
    const task = this.cronJobs.get(pipelineId);
    if (task) {
      task.stop();
      this.cronJobs.delete(pipelineId);
    }
  }

  // -------------------------------------------------------------------------
  // Mapping helpers
  // -------------------------------------------------------------------------

  private mapPipeline(row: any): Pipeline {
    return {
      id: row.id,
      name: row.name,
      agentId: row.agent_id,
      triggerType: row.trigger_type,
      triggerConfig: row.trigger_config || {},
      taskDesign: row.task_design,
      variablesSchema: row.variables_schema || {},
      variables: row.variables || {},
      executionConfig: row.execution_config || {},
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRun(row: any): PipelineRun {
    return {
      id: row.id,
      pipelineId: row.pipeline_id,
      triggerType: row.trigger_type,
      triggerPayload: row.trigger_payload || {},
      status: row.status,
      result: row.result || {},
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
    };
  }
}
