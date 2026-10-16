import { Controller, Get, HttpStatus } from '@nestjs/common';
import { DbService } from '../../common/db/db.service';
import { ClockService } from '../../common/clock/clock.service';
import { Public } from '../../common/guards/session-auth.guard';
import { SkipCsrf } from '../../common/guards/csrf-origin.guard';
import { DomainException } from '../../common/errors/domain.exception';

@Controller()
export class OperationsController {
  constructor(
    private readonly db: DbService,
    private readonly clock: ClockService,
  ) {}

  @Public()
  @SkipCsrf()
  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      serverNow: this.clock.isoString(),
    };
  }

  @Public()
  @SkipCsrf()
  @Get('ready')
  async getReady() {
    try {
      await this.db.query('SELECT 1');
      return {
        status: 'ready',
        database: 'connected',
        serverNow: this.clock.isoString(),
      };
    } catch {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'TEMPORARILY_UNAVAILABLE',
        'Database connection not ready',
      );
    }
  }
}
