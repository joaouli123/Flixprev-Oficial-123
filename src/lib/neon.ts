import { supabaseAuth } from './supabase-auth';

export { supabaseAuth };

// Cliente Neon para substituir Supabase
interface QueryResult<T = any> {
  data: T[] | null;
  error: null | { message: string };
  count?: number;
}

interface QueryBuilder extends PromiseLike<QueryResult> {
  select: (columns?: string, options?: any) => QueryBuilder;
  insert: (data: any) => QueryBuilder;
  update: (data: any) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (column: string, value: any) => QueryBuilder;
  or: (filters: string) => QueryBuilder;
  is: (column: string, value: any) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (num: number) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
  // Executar query
  execute: () => Promise<QueryResult>;
}

class NeonQuery implements QueryBuilder {
  private table: string;
  private operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' = 'SELECT';
  private filters: Array<{ column: string; value: any }> = [];
  private orFilters: string | null = null;
  private isFilters: Array<{ column: string; value: any }> = [];
  private columns: string = '*';
  private insertData: any = null;
  private updateData: any = null;
  private orderColumn: string | null = null;
  private orderAsc: boolean = true;
  private limitNum: number | null = null;
  private countExact: boolean = false;
  private maybeOne: boolean = false;
  private shouldReturnData: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string, options?: any) {
    if (this.operation === 'SELECT') {
      this.columns = columns || '*';
    } else {
      this.shouldReturnData = true;
    }
    if (options?.count === 'exact') {
      this.countExact = true;
    }
    return this;
  }

  insert(data: any) {
    this.operation = 'INSERT';
    this.insertData = data;
    return this;
  }

  update(data: any) {
    this.operation = 'UPDATE';
    this.updateData = data;
    return this;
  }

  delete() {
    this.operation = 'DELETE';
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push({ column, value });
    return this;
  }

  or(filters: string) {
    this.orFilters = filters;
    return this;
  }

  is(column: string, value: any) {
    this.isFilters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderColumn = column;
    this.orderAsc = options?.ascending !== false;
    return this;
  }

  limit(num: number) {
    this.limitNum = num;
    return this;
  }

  maybeSingle() {
    this.maybeOne = true;
    return this.execute();
  }

  async execute(): Promise<QueryResult> {
    try {
      let query: any = supabaseAuth.from(this.table);
      let result;

      if (this.operation === 'SELECT') {
        query = query.select(this.columns, { count: this.countExact ? 'exact' : undefined });
      } else if (this.operation === 'INSERT') {
        query = query.insert(this.insertData).select();
      } else if (this.operation === 'UPDATE') {
        query = query.update(this.updateData).select();
      } else if (this.operation === 'DELETE') {
        query = query.delete().select();
      }

      // Apply filters
      for (const filter of this.filters) {
        query = query.eq(filter.column, filter.value);
      }

      if (this.orFilters) {
        query = query.or(this.orFilters);
      }

      for (const filter of this.isFilters) {
        query = query.is(filter.column, filter.value);
      }

      // Apply order
      if (this.orderColumn) {
        query = query.order(this.orderColumn, { ascending: this.orderAsc });
      }

      // Apply limit
      if (this.limitNum) {
        query = query.limit(this.limitNum);
      }

      if (this.maybeOne) {
        result = await query.maybeSingle();
      } else {
        result = await query;
      }

      return {
        data: result.data,
        error: result.error ? { message: result.error.message } : null,
        count: result.count,
      };
    } catch (err: any) {
      return { data: null, error: { message: err.message || 'Erro ao conectar ao banco' } };
    }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const neon = {
  from: (table: string) => new NeonQuery(table),
};
