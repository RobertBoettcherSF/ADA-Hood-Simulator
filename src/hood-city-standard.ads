--  The Standard 40 x 32 city: the city plan (Hood.City.Plan) replayed into
--  blocks, lots and buildings (citygen.ts:262-351), and the headquarters
--  sites of the four gangs on the fine grid of 5 x 5 cells per block.
private package Hood.City.Standard with Preelaborate is

   procedure Build
     (C    : in out City_State;
      Main : in out Hood.Random.Mulberry;
      Seed : Unsigned_32)
     with Pre => C.W = Standard_W and then C.H = Standard_H;

   procedure Place_Headquarters (C : in out City_State; Seed : Unsigned_32);
   --  Gang g (1 .. 4) in quadrant g - 1, on its own city-plan LCG seeded
   --  with Hood.Random.Headquarters_Seed. Records the four sites; the
   --  fronts and offices are built in step 4.

   procedure Starting_Sites
     (C     : City_State;
      Gang  : Integer_32;
      Taken : Building_Flags;
      Sites : out Starting_Site_List;
      Count : out Integer_32);
   --  See Hood.City.Starting_Sites.

end Hood.City.Standard;
