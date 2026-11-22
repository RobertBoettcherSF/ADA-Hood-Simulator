--  Every size except 40 x 32: districts by distance from the centre and an
--  industrial edge (citygen.ts:153-172), reserved parks and civic sites,
--  block modules (cityLayout.ts:198-285), weighted building choices and
--  the landmarks of citygen.ts:510-536.
private package Hood.City.Varied with Preelaborate is

   procedure Build
     (C    : in out City_State;
      Main : in out Hood.Random.Mulberry;
      Seed : Unsigned_32);

end Hood.City.Varied;
