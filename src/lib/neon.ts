// Cliente Neon para substituir Supabase
interface QueryResult<T = any> {
  data: T[] | null;
  error: null | { message: string };
  count?: number;
}

interface QueryBuilder {
  select: (columns?: string, options?: any) => QueryBuilder;
  insert: (data: any) => QueryBuilder;
  update: (data: any) => QueryBuilder;
  delete: () => QueryBuilder;
  eq: (column: string, value: any) => QueryBuilder;
  order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
  limit: (num: number) => QueryBuilder;
  maybeSingle: () => Promise<QueryResult>;
  then: (callback: any) => Promise<QueryResult>;
  // Executar query
  execute: () => Promise<QueryResult>;
}

class NeonQuery implements QueryBuilder {
  private table: string;
  private operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' = 'SELECT';
  private filters: Array<{ column: string; value: any }> = [];
  private columns: string = '*';
  private insertData: any = null;
  private updateData: any = null;
  private orderColumn: string | null = null;
  private orderAsc: boolean = true;
  private limitNum: number | null = null;
  private countExact: boolean = false;
  private maybeOne: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns?: string, options?: any) {
    this.operation = 'SELECT';
    this.columns = columns || '*';
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
      const response = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: this.table,
          operation: this.operation,
          columns: this.columns,
          insertData: this.insertData,
          updateData: this.updateData,
          filters: this.filters,
          orderColumn: this.orderColumn,
          orderAsc: this.orderAsc,
          limit: this.limitNum,
          countExact: this.countExact,
          maybeOne: this.maybeOne,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return { data: null, error: { message: error.message || 'Erro na query' } };
      }

      const result = await response.json();
      return result;
    } catch (err: any) {
      return { data: null, error: { message: err.message || 'Erro ao conectar ao banco' } };
    }
  }

  then(callback: any) {
    return this.execute().then(callback);
  }
}

export const neon = {
  from: (table: string) => new NeonQuery(table),
};
